import { createClient } from '@supabase/supabase-js'
import {
  tg, actLabel, activityKeyboard, focusKeyboard, timeKeyboard,
  ACT_TO_FOCUS, FOCUS_LABELS, SUPABASE_URL, SUPABASE_ANON_KEY, BOT_TOKEN,
} from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

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

// ── AI-диалог (голосовые сообщения) ──────────────────────────

async function transcribeVoice(fileId: string): Promise<{ text: string; error?: string }> {
  const info = await tg('getFile', { file_id: fileId })
  const filePath = info.result?.file_path
  if (!filePath) return { text: '', error: 'getFile failed: ' + JSON.stringify(info) }

  const audioResp = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
  if (!audioResp.ok) return { text: '', error: `audio download ${audioResp.status}` }

  const audioBuffer = await audioResp.arrayBuffer()
  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg')
  form.append('model', 'whisper-1')
  form.append('language', 'ru')

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  })
  const data = await resp.json()
  if (!data.text) return { text: '', error: `whisper error: ${JSON.stringify(data)}` }
  return { text: data.text.trim() }
}

async function getChatHistory(date: string) {
  const { data } = await db
    .from('chat_messages')
    .select('role, content')
    .eq('date', date)
    .order('created_at', { ascending: true })
    .limit(20)
  return (data || []) as { role: string; content: string }[]
}

async function saveChatMsg(date: string, role: string, content: string) {
  await db.from('chat_messages').insert({ date, role, content })
}

async function buildSystemPrompt(today: string): Promise<string> {
  const { data: blocks } = await db
    .from('activity_blocks')
    .select('*')
    .eq('date', today)
    .order('started_at', { ascending: true })
  const bArr = (blocks || []) as any[]
  const hours: Record<string, number> = { biz: 0, sport: 0, blog: 0, other: 0 }
  const now = Date.now()
  bArr.forEach((b, i) => {
    const nextStart = bArr[i + 1] ? +new Date(bArr[i + 1].started_at) : null
    let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? now)
    if (nextStart && endMs > nextStart) endMs = nextStart
    hours[b.focus] += Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
  })
  const openBlock = bArr.find((b) => !b.ended_at)
  const cur = openBlock ? actLabel(openBlock.activity_id) : null
  const dateLabel = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })

  return `Ты личный ассистент Даши — помогаешь отслеживать время, поддерживаешь, ведёшь диалог. Сегодня ${dateLabel}.

Данные за день:
💼 Бизнес: ${hours.biz.toFixed(1)}ч / 6ч ${hours.biz >= 6 ? '✅' : ''}
🏃‍♀️ Спорт: ${hours.sport.toFixed(1)}ч / 0.5ч ${hours.sport >= 0.5 ? '✅' : ''}
🎬 Блог: ${hours.blog.toFixed(1)}ч / 2ч ${hours.blog >= 2 ? '✅' : ''}
${cur ? `Сейчас: ${cur}` : 'Сейчас ничего не отслеживается'}

Отвечай по-русски. Будь краткой (2–4 предложения), тёплой, живой. Не перечисляй данные без запроса. Если Даша делится мыслями — слушай и поддерживай. Если спрашивает о своём дне — отвечай по данным выше.`
}

async function aiReply(userText: string, today: string, history: { role: string; content: string }[]): Promise<string> {
  const system = await buildSystemPrompt(today)
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: userText }],
      max_tokens: 350,
      temperature: 0.85,
    }),
  })
  const json = await resp.json()
  return json.choices?.[0]?.message?.content?.trim() || 'Не смогла ответить 🙁'
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

async function handleUpdate(update: any) {
  const today = new Date().toISOString().slice(0, 10)

  // ── голосовое → AI-диалог ──
  if (update.message?.voice) {
    const chatId = update.message.chat.id
    if (!OPENAI_API_KEY) {
      await tg('sendMessage', { chat_id: chatId, text: '⚠️ OpenAI ключ не настроен' })
      return
    }
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
    const { text: transcript, error: transcribeError } = await transcribeVoice(update.message.voice.file_id)
    if (!transcript) {
      await tg('sendMessage', { chat_id: chatId, text: `Не удалось распознать голосовое 🙁\n\`${transcribeError}\`` })
      return
    }
    const history = await getChatHistory(today)
    await saveChatMsg(today, 'user', transcript)
    const reply = await aiReply(transcript, today, history)
    await saveChatMsg(today, 'assistant', reply)
    await tg('sendMessage', {
      chat_id: chatId,
      text: `_${transcript}_\n\n${reply}`,
      parse_mode: 'Markdown',
    })
    return
  }

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
    await handleUpdate(parseBody(req))
  } catch (e) {
    console.error('webhook error', e)
  }

  res.status(200).end() // всегда отвечаем 200 в конце
}
