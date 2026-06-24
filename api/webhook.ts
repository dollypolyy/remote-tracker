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

async function saveDiaryField(date: string, field: string, text: string) {
  const valid = ['done', 'achieved', 'not_achieved', 'thoughts', 'goals']
  if (!valid.includes(field)) return
  const { data } = await db.from('diary_entries').select('*').eq('date', date).maybeSingle()
  const existing = ((data as any)?.[field] as string) || ''
  const updated = existing ? `${existing}\n${text}` : text
  if (data) {
    await db.from('diary_entries').update({ [field]: updated }).eq('date', date)
  } else {
    await db.from('diary_entries').insert({ date, [field]: updated })
  }
}

async function buildSystemPrompt(today: string): Promise<string> {
  const start7 = new Date()
  start7.setDate(start7.getDate() - 7)
  const start7ISO = start7.toISOString().slice(0, 10)

  const [{ data: blocks }, { data: histBlocks }] = await Promise.all([
    db.from('activity_blocks').select('*').eq('date', today).order('started_at', { ascending: true }),
    db.from('activity_blocks').select('date, focus, started_at, ended_at').gte('date', start7ISO).lt('date', today),
  ])

  const bArr = (blocks || []) as any[]
  const hours: Record<string, number> = { biz: 0, sport: 0, blog: 0, other: 0 }
  const now = Date.now()
  bArr.forEach((b, i) => {
    const nextStart = bArr[i + 1] ? +new Date(bArr[i + 1].started_at) : null
    let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? now)
    if (nextStart && endMs > nextStart) endMs = nextStart
    hours[b.focus] += Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
  })
  const openBlock = bArr.find((b: any) => !b.ended_at)
  const cur = openBlock ? actLabel(openBlock.activity_id) : null

  // 7-day history
  const byDate = new Map<string, Record<string, number>>()
  for (const b of (histBlocks || []) as any[]) {
    if (!byDate.has(b.date)) byDate.set(b.date, { biz: 0, sport: 0, blog: 0 })
    const s = +new Date(b.started_at)
    const e = b.ended_at ? +new Date(b.ended_at) : s + 1_800_000
    const h = byDate.get(b.date)!
    if (b.focus in h) h[b.focus] += Math.max(0, (e - s) / 3_600_000)
  }
  const histLines = Array.from(byDate.entries()).slice(-5).map(([date, h]) => {
    const d = new Date(date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Moscow' })
    const ok = (h.biz >= 6 ? '✅' : '▫️') + (h.sport >= 0.5 ? '✅' : '▫️') + (h.blog >= 2 ? '✅' : '▫️')
    return `${d}: 💼${h.biz.toFixed(1)} 🏃‍♀️${h.sport.toFixed(1)} 🎬${h.blog.toFixed(1)} ${ok}`
  })

  const dateLabel = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Moscow',
  })

  return `Ты — Will, личный AI-коуч Даши. Назван в честь Will Smith — харизматичный, прямой, с юмором, поддерживающий.

Твоя миссия: помочь Даше удерживать фокус на трёх приоритетах:
💼 Бизнес/AI — минимум 6ч/день
🏃‍♀️ Спорт/здоровье — минимум 30 мин/день
🎬 Блог/контент — минимум 2ч/день

Правила:
— Называй её «Даша», себя — «Will»
— Короткие ответы (2–4 предложения), если не просят подробнее
— Живой тон, лёгкий юмор, без занудства
— Используй конкретные данные о её дне в ответах
— Когда Даша делится инсайтом, мыслью, рефлексией — вызывай save_diary_thought
— Замечай паттерны в истории и называй их
— Если Даша говорит что начала/делала что-то — вызывай log_activity

Справочник активностей:
💼 бизнес: поиск(biz_research) планирование(biz_plan) обучение(biz_learn) делаю продукт(biz_build) созвоны(biz_calls) стратегия(biz_strategy)
🏃‍♀️ спорт: зал(sport_gym) дома(sport_home) прогулка(sport_walk) пробежка(sport_run) танцы(sport_dance) йога(sport_yoga) другое(sport_other)
🎬 блог: идея(blog_idea) съёмка(blog_film) монтаж(blog_edit) публикация(blog_post)
🌿 прочее: готовка(other_cook) еда(other_eat) учёба(other_study) быт(other_chores) отдых(other_rest) дорога(other_road) залипание(other_scroll) личное(other_personal)

Сегодня ${dateLabel}.

📊 Сегодня:
💼 ${hours.biz.toFixed(1)}ч / 6ч ${hours.biz >= 6 ? '✅' : ''}
🏃‍♀️ ${hours.sport.toFixed(1)}ч / 0.5ч ${hours.sport >= 0.5 ? '✅' : ''}
🎬 ${hours.blog.toFixed(1)}ч / 2ч ${hours.blog >= 2 ? '✅' : ''}
${cur ? `Сейчас: ${cur}` : 'Сейчас не отслеживается'}

📅 Последние дни:
${histLines.length ? histLines.join('\n') : 'Данных пока нет'}`
}

async function logActivity(activityId: string, focus: string, startedAt: Date, endedAt?: Date) {
  const today = new Date().toISOString().slice(0, 10)
  if (endedAt) {
    // Ретроактивный блок — закрываем предыдущие открытые, что начались раньше
    await db.from('activity_blocks')
      .update({ ended_at: startedAt.toISOString() })
      .eq('date', today)
      .is('ended_at', null)
      .lt('started_at', startedAt.toISOString())
    await db.from('activity_blocks').insert({
      date: today,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      activity_id: activityId,
      focus,
    })
  } else {
    await openBlock(activityId, focus, startedAt)
  }
}

const LOG_TOOL = {
  type: 'function' as const,
  function: {
    name: 'log_activity',
    description: 'Записать активность Даши — что она начала или делала. Вызывай когда она говорит «я начала X в 10:45» или «с 10 до 11 делала Y». Можно вызывать несколько раз для нескольких активностей.',
    parameters: {
      type: 'object',
      properties: {
        activity_id: {
          type: 'string',
          enum: [
            'biz_research','biz_plan','biz_learn','biz_build','biz_calls','biz_strategy',
            'sport_gym','sport_home','sport_walk','sport_run','sport_dance','sport_yoga','sport_other',
            'blog_idea','blog_film','blog_edit','blog_post',
            'other_cook','other_eat','other_study','other_chores','other_rest','other_road','other_scroll','other_personal',
          ],
          description: 'ID активности',
        },
        started_at: { type: 'string', description: 'Время начала HH:MM (если не указано — сейчас)' },
        ended_at: { type: 'string', description: 'Время конца HH:MM — только если активность уже завершена' },
      },
      required: ['activity_id'],
    },
  },
}

const DIARY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'save_diary_thought',
    description: 'Сохранить мысль, инсайт или рефлексию Даши в дневник. Вызывай когда она делится чем-то значимым о своём дне, работе, чувствах, планах или уроках.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Текст для сохранения (можно перефразировать для ясности)' },
        field: {
          type: 'string',
          enum: ['done', 'achieved', 'not_achieved', 'thoughts', 'goals'],
          description: 'done=что сделала, achieved=победы и достижения, not_achieved=что не получилось, thoughts=мысли и уроки, goals=цели на завтра',
        },
      },
      required: ['text', 'field'],
    },
  },
}

async function aiReply(userText: string, today: string, history: { role: string; content: string }[]): Promise<string> {
  const system = await buildSystemPrompt(today)
  const msgs: any[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: userText }]

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: msgs, tools: [LOG_TOOL, DIARY_TOOL], tool_choice: 'auto', max_tokens: 400, temperature: 0.85 }),
  })
  const json = await resp.json()
  const msg = json.choices?.[0]?.message

  if (msg?.tool_calls?.length) {
    const toolResults: any[] = []
    for (const tc of msg.tool_calls) {
      try {
        const args = JSON.parse(tc.function.arguments)
        if (tc.function.name === 'log_activity') {
          const focus = ACT_TO_FOCUS[args.activity_id] || 'other'
          const startedAt = args.started_at ? (parseMskTime(args.started_at) ?? new Date()) : new Date()
          const endedAt = args.ended_at ? parseMskTime(args.ended_at) ?? undefined : undefined
          await logActivity(args.activity_id, focus, startedAt, endedAt)
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'logged' })
        } else if (tc.function.name === 'save_diary_thought') {
          await saveDiaryField(today, args.field, args.text)
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'saved' })
        }
      } catch {
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'error' })
      }
    }
    const resp2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [...msgs, msg, ...toolResults], max_tokens: 300, temperature: 0.85 }),
    })
    const json2 = await resp2.json()
    return json2.choices?.[0]?.message?.content?.trim() || '✅ Готово'
  }

  return msg?.content?.trim() || 'Не смогла ответить 🙁'
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
