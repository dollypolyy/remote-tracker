import { createClient } from '@supabase/supabase-js'
import {
  tg, actLabel, activityKeyboard, focusKeyboard, timeKeyboard,
  ACT_TO_FOCUS, FOCUS_LABELS, SUPABASE_URL, SUPABASE_ANON_KEY,
} from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function mskTime(d: Date): string {
  return d.toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  })
}

async function getOpenBlock(today: string) {
  const { data } = await db
    .from('activity_blocks')
    .select('*')
    .eq('date', today)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

// Открыть новый блок с заданным временем начала.
// Предыдущий открытый блок закрывается этим же временем (раньше — значит он раньше и закончился).
async function openBlock(activityId: string, focus: string, startedAt: Date) {
  const today = new Date().toISOString().slice(0, 10)
  await db
    .from('activity_blocks')
    .update({ ended_at: startedAt.toISOString() })
    .eq('date', today)
    .is('ended_at', null)
  await db.from('activity_blocks').insert({
    date: today,
    started_at: startedAt.toISOString(),
    activity_id: activityId,
    focus,
  })
}

// Парсит «14:30» / «1430» / «14 30» → Date с этим временем сегодня по МСК
function parseMskTime(text: string): Date | null {
  const m = text.trim().match(/^(\d{1,2})[:.\s]?(\d{2})$/)
  if (!m) return null
  const hh = +m[1], mm = +m[2]
  if (hh > 23 || mm > 59) return null
  const today = new Date().toISOString().slice(0, 10)
  const d = new Date(`${today}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`)
  return isNaN(d.getTime()) ? null : d
}

// Возвращает фокус предыдущего блока, если он требует рефлексии (бизнес/спорт/блог → другой)
async function prevFocusForReflection(today: string, newFocus: string): Promise<string | null> {
  const open = await getOpenBlock(today)
  if (!open) return null
  if (open.focus === newFocus) return null
  if (!['biz', 'sport', 'blog'].includes(open.focus)) return null
  return open.focus
}

const REFLECT_Q: Record<string, string> = {
  biz:   'Завершила блок 💼 бизнес. Что успела? Что получилось, что нет? ✍️',
  sport: 'Завершила 🏃‍♀️ спорт. Как прошло? ✍️',
  blog:  'Завершила блок 🎬 блог. Что получилось? ✍️',
}

async function sendReflectionPrompt(chatId: number, focus: string) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: `${REFLECT_Q[focus]}\n#reflect_${focus}`,
    reply_markup: { force_reply: true, input_field_placeholder: 'пара предложений…' },
  })
}

async function saveReflection(date: string, focus: string, text: string) {
  const ts = new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  })
  const { data } = await db.from('diary_entries').select('reflections').eq('date', date).maybeSingle()
  const prev = (data as any)?.reflections ?? []
  const updated = [...prev, { focus, text: text.trim(), time: ts }]
  if (data) {
    await db.from('diary_entries').update({ reflections: updated }).eq('date', date)
  } else {
    await db.from('diary_entries').insert({ date, reflections: updated })
  }
}

async function confirmStart(chatId: number, actId: string, started: Date) {
  const today = new Date().toISOString().slice(0, 10)
  const focus = ACT_TO_FOCUS[actId] || 'other'
  const prevFocus = await prevFocusForReflection(today, focus)
  await openBlock(actId, focus, started)
  await tg('sendMessage', {
    chat_id: chatId,
    text: `✅ ${actLabel(actId)} · ${FOCUS_LABELS[focus]}\nНачало: ${mskTime(started)} МСК`,
  })
  if (prevFocus) await sendReflectionPrompt(chatId, prevFocus)
}

async function process(update: any) {
  const today = new Date().toISOString().slice(0, 10)

  // ── текстовое сообщение ──
  if (update.message) {
    const chatId = update.message.chat.id
    const text: string = update.message.text || ''
    const replyText: string = update.message.reply_to_message?.text || ''

    // ответ на запрос рефлексии — в тексте зашит #reflect_{focus}
    const reflectMatch = replyText.match(/#reflect_([a-z]+)/)
    if (reflectMatch) {
      await saveReflection(today, reflectMatch[1], text)
      await tg('sendMessage', { chat_id: chatId, text: '✅ Записала в дневник 📝' })
      return
    }

    // ответ на запрос «введи время» — в тексте исходного сообщения зашит #actId
    const tagMatch = replyText.match(/#([a-z_]+)/)
    if (tagMatch) {
      const actId = tagMatch[1]
      const parsed = parseMskTime(text)
      if (!parsed) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: '⏱ Не поняла время. Напиши в формате 14:30',
        })
        return
      }
      if (parsed.getTime() > Date.now() + 60_000) {
        await tg('sendMessage', {
          chat_id: chatId,
          text: '⏱ Нельзя ставить время вперёд 🙂 Напиши время, которое уже прошло.',
        })
        return
      }
      await confirmStart(chatId, actId, parsed)
      return
    }

    // обычное сообщение → показать опрос
    const open = await getOpenBlock(today)
    await tg('sendMessage', {
      chat_id: chatId,
      text: '⏰ Что делаешь?',
      reply_markup: focusKeyboard(open?.activity_id),
    })
    return
  }

  if (!update.callback_query) return

  const cbq = update.callback_query
  const chatId = cbq.message.chat.id
  const messageId = cbq.message.message_id
  const data: string = cbq.data

  await tg('answerCallbackQuery', { callback_query_id: cbq.id })

  if (data === 'cont') {
    const open = await getOpenBlock(today)
    const label = open ? actLabel(open.activity_id) : null
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: label ? `✅ Продолжаешь: ${label}` : '✅ Продолжаешь',
    })
    return
  }

  if (data === 'back') {
    const open = await getOpenBlock(today)
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: '⏰ Что делаешь?',
      reply_markup: focusKeyboard(open?.activity_id),
    })
    return
  }

  // выбрали фокус → показать активности
  if (data.startsWith('f:')) {
    const focus = data.slice(2)
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: `${FOCUS_LABELS[focus]} — выбери активность:`,
      reply_markup: activityKeyboard(focus),
    })
    return
  }

  // выбрали активность → спросить, когда началось
  if (data.startsWith('a:')) {
    const actId = data.slice(2)
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: `⏱ «${actLabel(actId)}» — когда началось?`,
      reply_markup: timeKeyboard(actId),
    })
    return
  }

  // выбрали время начала
  if (data.startsWith('s:')) {
    const [, actId, when] = data.split(':')

    if (when === 'custom') {
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `⏱ «${actLabel(actId)}» — во сколько началось?`,
      })
      // отдельное сообщение с force_reply и зашитым #actId
      await tg('sendMessage', {
        chat_id: chatId,
        text: `Напиши время в формате 14:30\n#${actId}`,
        reply_markup: { force_reply: true },
      })
      return
    }

    const minsAgo = parseInt(when, 10) || 0
    const started = new Date(Date.now() - minsAgo * 60_000)
    const focus = ACT_TO_FOCUS[actId] || 'other'
    const prevFocus = await prevFocusForReflection(today, focus)
    await openBlock(actId, focus, started)
    await tg('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: `✅ ${actLabel(actId)} · ${FOCUS_LABELS[focus]}\nНачало: ${mskTime(started)} МСК`,
    })
    if (prevFocus) await sendReflectionPrompt(chatId, prevFocus)
    return
  }
}

function parseBody(req: any): any {
  const b = req.body
  if (!b) return {}
  if (typeof b === 'string') {
    try { return JSON.parse(b) } catch { return {} }
  }
  return b
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    await process(parseBody(req))
  } catch (e) {
    console.error('webhook error', e)
  }

  res.status(200).end() // всегда отвечаем 200 в конце
}
