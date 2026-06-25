import { createClient } from '@supabase/supabase-js'
import {
  tg, actLabel, activityKeyboard, focusKeyboard, timeKeyboard, mainMenuKeyboard,
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
  // Деdup: не создавать, если точно такой же блок уже есть в ±60 сек
  const { data: dup } = await db.from('activity_blocks').select('id')
    .eq('date', today).eq('activity_id', activityId)
    .gte('started_at', new Date(startedAt.getTime() - 60_000).toISOString())
    .lte('started_at', new Date(startedAt.getTime() + 60_000).toISOString()).limit(1)
  if (dup && dup.length > 0) return
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

// Авто-категоризация мысли и сохранение в reflections с нужным тегом сферы
async function handleThought(chatId: number, text: string, today: string) {
  let focus = 'other'
  if (OPENAI_API_KEY) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `К какой сфере относится мысль? biz=бизнес/AI/продукт/деньги/стратегия, sport=спорт/здоровье/тело/тренировки, blog=блог/съёмка/контент/TikTok/YouTube/монтаж, other=всё остальное. Ответь одним словом без объяснений.\n\n"${text}"`,
        }],
        max_tokens: 10,
      }),
    })
    const json = await resp.json()
    const raw = json.choices?.[0]?.message?.content?.trim().toLowerCase() || ''
    if (['biz', 'sport', 'blog', 'other'].includes(raw)) focus = raw
  }
  await saveReflection(today, focus, text)
  const labels: Record<string, string> = { biz: '💼 бизнес', sport: '🏃‍♀️ спорт', blog: '🎬 блог', other: '🌿 прочее' }
  await tg('sendMessage', { chat_id: chatId, text: `✍️ Записала → ${labels[focus]}` })
}

// ── Данные и память ──────────────────────────────────────────

async function savePref(key: string, value: string) {
  try {
    const { data } = await db.from('user_prefs').select('key').eq('key', key).maybeSingle()
    if (data) {
      await db.from('user_prefs').update({ value, updated_at: new Date().toISOString() }).eq('key', key)
    } else {
      await db.from('user_prefs').insert({ key, value })
    }
  } catch { /* таблица ещё не создана */ }
}

async function loadPrefs(): Promise<{ key: string; value: string }[]> {
  try {
    const { data } = await db.from('user_prefs').select('key, value').order('key')
    return (data || []) as { key: string; value: string }[]
  } catch { return [] }
}

export async function computeStatsForPeriod(startISO: string, endISO: string): Promise<string> {
  const { data: blocks } = await db
    .from('activity_blocks')
    .select('date, focus, started_at, ended_at')
    .gte('date', startISO)
    .lte('date', endISO)
    .order('started_at', { ascending: true })

  const byDate = new Map<string, Record<string, number>>()
  for (const b of (blocks || []) as any[]) {
    if (!byDate.has(b.date)) byDate.set(b.date, { biz: 0, sport: 0, blog: 0, other: 0 })
    const s = +new Date(b.started_at)
    const e = b.ended_at ? +new Date(b.ended_at) : s + 1_800_000
    const h = byDate.get(b.date)!
    const f = ['biz', 'sport', 'blog', 'other'].includes(b.focus) ? b.focus : 'other'
    h[f] += Math.max(0, (e - s) / 3_600_000)
  }

  const activeDays = byDate.size
  if (activeDays === 0) return `Нет данных за ${startISO} – ${endISO}`

  const totals = { biz: 0, sport: 0, blog: 0, other: 0 }
  for (const h of byDate.values()) {
    totals.biz += h.biz; totals.sport += h.sport; totals.blog += h.blog; totals.other += h.other
  }
  const n = activeDays
  const focusTotal = totals.biz + totals.sport + totals.blog
  return `${startISO} – ${endISO} · ${activeDays} активных дней
💼 бизнес: ${totals.biz.toFixed(1)} ч (сред. ${(totals.biz/n).toFixed(1)}/день) ${totals.biz/n >= 6 ? '✅' : ''}
🏃‍♀️ спорт: ${totals.sport.toFixed(1)} ч (сред. ${(totals.sport/n).toFixed(1)}/день) ${totals.sport/n >= 0.5 ? '✅' : ''}
🎬 блог: ${totals.blog.toFixed(1)} ч (сред. ${(totals.blog/n).toFixed(1)}/день) ${totals.blog/n >= 2 ? '✅' : ''}
🌿 прочее: ${totals.other.toFixed(1)} ч
🎯 в фокусе суммарно: ${focusTotal.toFixed(1)} ч`
}

export async function getDiaryEntries(startISO: string, endISO: string, field?: string): Promise<string> {
  const { data } = await db
    .from('diary_entries')
    .select('date, achieved, not_achieved, thoughts, goals, reflections')
    .gte('date', startISO)
    .lte('date', endISO)
    .order('date', { ascending: true })

  const entries = (data || []) as any[]
  if (entries.length === 0) return `Нет записей дневника за ${startISO} – ${endISO}`

  const FOCUS_NAMES: Record<string, string> = { biz: 'бизнес', sport: 'спорт', blog: 'блог', other: 'прочее' }
  const lines: string[] = []
  for (const e of entries) {
    const d = new Date(e.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' })
    const all = !field || field === 'all'
    if ((all || field === 'achieved') && e.achieved)        lines.push(`${d} ✅ победы: ${e.achieved}`)
    if ((all || field === 'not_achieved') && e.not_achieved) lines.push(`${d} ⚠️ не вышло: ${e.not_achieved}`)
    if ((all || field === 'thoughts') && e.thoughts)         lines.push(`${d} 💭 мысли: ${e.thoughts}`)
    if ((all || field === 'goals') && e.goals)               lines.push(`${d} 🎯 цели: ${e.goals}`)
    if (all || field === 'reflections') {
      for (const r of (e.reflections || []) as { focus: string; text: string }[]) {
        lines.push(`${d} [${FOCUS_NAMES[r.focus] || r.focus}] «${r.text.slice(0, 120)}»`)
      }
    }
  }
  return lines.length > 0 ? lines.join('\n') : `Нет записей за ${startISO} – ${endISO}`
}

async function getTimelineForDate(date: string): Promise<string> {
  const { data: blocks } = await db
    .from('activity_blocks').select('*').eq('date', date).order('started_at', { ascending: true })
  const bArr = (blocks || []) as any[]
  if (bArr.length === 0) return `Нет данных за ${date}`
  const now = Date.now()
  const lines = bArr.map((b: any, i: number) => {
    const nextStart = bArr[i + 1] ? +new Date(bArr[i + 1].started_at) : null
    let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? now)
    if (nextStart && endMs > nextStart) endMs = nextStart
    const s = new Date(b.started_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
    const e = b.ended_at ? new Date(endMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'сейчас'
    const h = Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
    return `  ${s}–${e} ${actLabel(b.activity_id)} (${h.toFixed(1)}ч)`
  })
  return `Лента ${date}:\n${lines.join('\n')}`
}

// ── Авто-извлечение мысли (параллельно с основным ответом) ──────
// Отдельный быстрый вызов: определяет мысль до aiReply, гарантирует сохранение
async function extractAndSaveThought(text: string, today: string): Promise<string | null> {
  if (!OPENAI_API_KEY) return null
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: 'Determine if this message contains a personal thought, reflection, feeling, insight, or observation worth saving to a diary.\nNOT a thought: requests to log activity with specific times ("с 15 до 16"), questions about data/stats, short confirmations ("да","нет","ок"), greetings.\nIS a thought: opinions, feelings, insights, ideas, lessons, observations about life/work/self.\nReply ONLY with valid JSON: {"is_thought": boolean, "focus": "biz|sport|blog|other", "text": "the thought in first person, cleaned up"}',
        }, { role: 'user', content: text }],
        response_format: { type: 'json_object' },
        max_tokens: 150,
        temperature: 0,
      }),
    })
    const json = await resp.json()
    const result = JSON.parse(json.choices?.[0]?.message?.content || '{}')
    if (result.is_thought && result.text) {
      await saveReflection(today, result.focus || 'other', result.text)
      return result.focus || 'other'
    }
  } catch { /* не критично */ }
  return null
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

  const [{ data: blocks }, { data: histBlocks }, { data: recentDiaries }, prefs] = await Promise.all([
    db.from('activity_blocks').select('*').eq('date', today).order('started_at', { ascending: true }),
    db.from('activity_blocks').select('date, focus, started_at, ended_at').gte('date', start7ISO).lt('date', today),
    db.from('diary_entries').select('date, reflections').gte('date', start7ISO).not('reflections', 'is', null),
    loadPrefs(),
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

  // Лента дня для контекста подтверждения
  const timelineSummary = bArr.length > 0
    ? bArr.map((b: any, i: number) => {
        const nextStart = bArr[i + 1] ? +new Date(bArr[i + 1].started_at) : null
        let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? now)
        if (nextStart && endMs > nextStart) endMs = nextStart
        const startStr = new Date(b.started_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
        const endStr = b.ended_at ? new Date(endMs).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : 'сейчас'
        return `  ${startStr}–${endStr} ${actLabel(b.activity_id)}`
      }).join('\n')
    : '  (пока пусто)'

  // 7-day history
  const byDate = new Map<string, Record<string, number>>()
  for (const b of (histBlocks || []) as any[]) {
    if (!byDate.has(b.date)) byDate.set(b.date, { biz: 0, sport: 0, blog: 0 })
    const s = +new Date(b.started_at)
    const e = b.ended_at ? +new Date(b.ended_at) : s + 1_800_000
    const h = byDate.get(b.date)!
    if (b.focus in h) h[b.focus] += Math.max(0, (e - s) / 3_600_000)
  }
  // Рефлексии за 7 дней — для контекста Will
  const FOCUS_NAMES: Record<string, string> = { biz: 'бизнес', sport: 'спорт', blog: 'блог', other: 'прочее' }
  const reflLines: string[] = []
  for (const entry of (recentDiaries || []) as any[]) {
    const refls = (entry.reflections || []) as { focus: string; text: string; time: string }[]
    const d = new Date(entry.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' })
    for (const r of refls) {
      reflLines.push(`  ${d} [${FOCUS_NAMES[r.focus] || r.focus}] «${r.text.slice(0, 120)}»`)
    }
  }

  const histLines = Array.from(byDate.entries()).slice(-5).map(([date, h]) => {
    const d = new Date(date).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Moscow' })
    const ok = (h.biz >= 6 ? '✅' : '▫️') + (h.sport >= 0.5 ? '✅' : '▫️') + (h.blog >= 2 ? '✅' : '▫️')
    return `${d}: 💼${h.biz.toFixed(1)} 🏃‍♀️${h.sport.toFixed(1)} 🎬${h.blog.toFixed(1)} ${ok}`
  })

  const dateLabel = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Moscow',
  })
  const nowMSK = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })
  const mskHour = (new Date().getUTCHours() + 3) % 24
  const timeAdvice = mskHour < 13
    ? 'Утро — любой прогресс с утра это хороший темп, поддерживай.'
    : mskHour < 17
    ? 'Середина дня — продуктивное время, можно мягко подтолкнуть если прогресса мало.'
    : 'Вечер — фокус на итогах, настраивай на завтра.'

  return `Ты — Will, личный ИИ-коуч Даши. Совмещаешь три роли:
1. Трекер времени — записываешь активности голосом и текстом
2. Личный дневник — сохраняешь рефлексии, победы, цели
3. Коуч — держишь в фокусе, поддерживаешь, закрываешь день

━━━ СТИЛЬ (жёсткие правила) ━━━
— Никогда «ё» — только «е» (все, еще, нет, идет, берет)
— Называй только «Даша» — никогда «Даш», «Дарья», «ты»
— Неформально: «го», «норм», «топ», «кайф», «огонь», «слушай», «ок», «давай»
— Каждая мысль — отдельная строка, не стена текста
— Максимум 3-4 строки если не просят больше
— НЕ заканчивай каждое сообщение вопросом. Большинство ответов — просто поддержка или подтверждение. Вопрос уместен максимум раз из трёх
— Тональность: честно и с теплом, как лучший друг. Никогда «это ни о чем», «вообще ноль» — вместо этого «есть куда расти», «го добавлять»
— ${timeAdvice}
— ЧЕСТНОСТЬ: если не можешь выполнить запрос — скажи прямо: «не могу [что именно] — [почему]. зато могу [альтернатива]». Никогда не молчи о границах и не делай вид что выполняешь то, что не можешь

━━━ АЛГОРИТМ — ЧТО ДЕЛАТЬ С КАЖДЫМ СООБЩЕНИЕМ ━━━
Перед ответом определи тип и выполни нужное действие:

▶ ТИП А — МЫСЛЬ / ЧУВСТВО / ОТКРЫТИЕ
Признаки: рассуждение, суждение, эмоция, наблюдение — что угодно НЕ про «делала X с T1 до T2».
Примеры: «использую это время как возможность», «поняла что мне важно», «кайф от этого», «идея по блогу», «злюсь на себя», «вывод такой», «хочу попробовать»
ДЕЙСТВИЕ: вызвать save_thought(focus=..., text=...) → и только потом ответить.
⛔ НЕЛЬЗЯ похвалить мысль («кайфовая!», «топ!», «огонь!») без предварительного save_thought.
⛔ НЕЛЬЗЯ потом говорить «нет записей» если ты уже хвалил мысль в этом разговоре — ты её просто не сохранил, признай и сохрани сейчас.
⛔ НЕЛЬЗЯ говорить «я не записываю голосовые» — ты ВСЕГДА обрабатываешь голос.

▶ ТИП Б — АКТИВНОСТЬ + ДИАПАЗОН ВРЕМЕНИ
Признаки: «делала X с 15:00 до 16:30», «с 9 до 10 была в зале», «снимала с обеда до 17»
ДЕЙСТВИЕ: правило подтверждения →
  1. Найди в ленте дня (ниже) блоки ДО и ПОСЛЕ
  2. «Сверяю: [до] → [X–Y] → [после]. Записать?»
  3. Жди «да/верно/ок» → log_activity
  Исключение — записывать сразу: «сейчас делаю X» (открытый блок без конца)

▶ ТИП В — ЗАПРОС ДАННЫХ
«покажи статистику», «что в дневнике», «лента вчера», «сколько часов за неделю»
ДЕЙСТВИЕ: get_stats / get_diary / get_timeline — вызывай, не говори «нет доступа»

▶ ТИП Г — ВЕЧЕРНИЙ ДНЕВНИК
Даша отвечает на 5 вопросов «Давай закроем день» из истории переписки
ДЕЙСТВИЕ: save_diary_thought для каждого из 5 пунктов (done/achieved/not_achieved/thoughts/goals)
После: «Записала! Что добавить или всё ок?» → если ок → «Спокойной ночи 🌙» + живая фраза

▶ ТИП Д — РАСПИСАНИЯ И НАСТРОЙКИ
«каждый четверг в 9 присылай...», «запомни что...», «отмени напоминание»
ДЕЙСТВИЕ: create_schedule / list_schedules / delete_schedule / save_pref
  Пример: «каждый четверг в 9» → create_schedule(label="...", weekdays=["thu"], hour_msk=9, prompt="...")
  После создания: «Настроила — буду присылать каждый [день] в [время] МСК»

━━━ ДОСТУП К ДАННЫМ ━━━
— Статистика → get_stats(start_date, end_date)
— Дневник, мысли, победы → get_diary(start_date, end_date, field?)  ← field="reflections" для мыслей
— Лента дня → get_timeline(date)
«Прошлая неделя» = последние 7 дней. «Этот месяц» = с начала месяца.

━━━ РЕФЛЕКСИЯ ПОСЛЕ БЛОКОВ ━━━
Когда Даша отвечает на автоматический запрос рефлексии (#reflect_biz/sport/blog) → save_thought(focus=тот фокус, text=ответ).

━━━ СПРАВОЧНИК АКТИВНОСТЕЙ ━━━
💼 бизнес: поиск(biz_research) планирование(biz_plan) обучение(biz_learn) делаю продукт(biz_build) созвоны(biz_calls) стратегия(biz_strategy)
🏃‍♀️ спорт: зал(sport_gym) дома(sport_home) прогулка(sport_walk) пробежка(sport_run) танцы(sport_dance) йога(sport_yoga) другое(sport_other)
🎬 блог: идея(blog_idea) съёмка(blog_film) монтаж(blog_edit) публикация(blog_post)
🌿 прочее: готовка(other_cook) еда(other_eat) учёба(other_study) быт(other_chores) отдых(other_rest) дорога(other_road) залипание(other_scroll) личное(other_personal)

━━━ СЕГОДНЯ · ${dateLabel} · ${nowMSK} МСК ━━━
💼 ${hours.biz.toFixed(1)}ч / 6ч ${hours.biz >= 6 ? '✅' : ''}  🏃‍♀️ ${hours.sport.toFixed(1)}ч / 0.5ч ${hours.sport >= 0.5 ? '✅' : ''}  🎬 ${hours.blog.toFixed(1)}ч / 2ч ${hours.blog >= 2 ? '✅' : ''}
${cur ? `Сейчас: ${cur}` : 'Сейчас не отслеживается'}

Лента дня (для контекста при подтверждении):
${timelineSummary}

📅 Последние дни:
${histLines.length ? histLines.join('\n') : 'Данных пока нет'}

✍️ Мысли (7 дней):
${reflLines.length ? reflLines.join('\n') : '  (пока нет)'}

⚙️ Настройки Даши:
${prefs.length ? prefs.map(p => `  ${p.key}: ${p.value}`).join('\n') : '  (нет сохранённых настроек)'}`
}

async function logActivity(activityId: string, focus: string, startedAt: Date, endedAt?: Date) {
  const today = new Date().toISOString().slice(0, 10)
  if (endedAt) {
    // Валидация: start < end и минимум 1 минута
    if (endedAt.getTime() <= startedAt.getTime()) {
      // GPT перепутал порядок — меняем местами
      [startedAt, endedAt] = [endedAt, startedAt]
    }
    if (endedAt.getTime() - startedAt.getTime() < 60_000) return // слишком короткий блок
    // Деdup: не создавать, если такой блок уже есть
    const { data: dup } = await db.from('activity_blocks').select('id')
      .eq('date', today).eq('activity_id', activityId)
      .gte('started_at', new Date(startedAt.getTime() - 60_000).toISOString())
      .lte('started_at', new Date(startedAt.getTime() + 60_000).toISOString()).limit(1)
    if (dup && dup.length > 0) return
    // Ретроактивный блок — закрываем предыдущие открытые, что начались раньше
    await db.from('activity_blocks')
      .update({ ended_at: startedAt.toISOString() })
      .eq('date', today).is('ended_at', null)
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

const GET_STATS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_stats',
    description: 'Получить статистику по времени за любой период. Вызывай когда Даша спрашивает о статистике, прогрессе, результатах за прошлую неделю, месяц или конкретные даты.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Начало периода YYYY-MM-DD' },
        end_date: { type: 'string', description: 'Конец периода YYYY-MM-DD (включительно)' },
      },
      required: ['start_date', 'end_date'],
    },
  },
}

const GET_DIARY_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_diary',
    description: 'Получить записи дневника за любой период: победы, мысли, цели, рефлексии. Вызывай когда Даша просит показать свои записи, победы, мысли по теме.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Начало периода YYYY-MM-DD' },
        end_date: { type: 'string', description: 'Конец периода YYYY-MM-DD' },
        field: {
          type: 'string',
          enum: ['all', 'achieved', 'not_achieved', 'thoughts', 'goals', 'reflections'],
          description: 'Что показать: all=всё, или конкретное поле',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },
}

const GET_TIMELINE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_timeline',
    description: 'Получить полную ленту активностей за любой конкретный день (не сегодня — для сегодня данные уже в контексте).',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Дата YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
}

const SAVE_PREF_TOOL = {
  type: 'function' as const,
  function: {
    name: 'save_pref',
    description: 'Запомнить простую настройку или предпочтение (НЕ для расписаний — для них используй create_schedule). Например: формат ответов, стиль приветствия.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Ключ snake_case: report_format, greeting_style, и т.д.' },
        value: { type: 'string', description: 'Значение. Пустая строка — удалить настройку.' },
      },
      required: ['key', 'value'],
    },
  },
}

const CREATE_SCHEDULE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'create_schedule',
    description: 'Создать автоматическую задачу по расписанию — Will выполнит её сам в нужный день и час без участия Даши. Используй когда она говорит «каждый [день] в [время] делай X», «автоматически каждую неделю», «напоминай по [дням]».',
    parameters: {
      type: 'object',
      properties: {
        label:    { type: 'string', description: 'Короткое название: «Недельный отчёт», «Напоминание о спорте»' },
        weekdays: { type: 'array', items: { type: 'string' }, description: 'Дни: ["*"]=каждый день, или ["mon","thu"]. Для «каждый четверг» → ["thu"]' },
        hour_msk: { type: 'number', description: 'Час по МСК (0–23). По умолчанию 9.' },
        prompt:   { type: 'string', description: 'Что сделать: «Отправь статистику недели по всем фокусам с инсайтом»' },
      },
      required: ['label', 'weekdays', 'hour_msk', 'prompt'],
    },
  },
}

const LIST_SCHEDULES_TOOL = {
  type: 'function' as const,
  function: {
    name: 'list_schedules',
    description: 'Показать все активные запланированные задачи. Вызывай когда Даша спрашивает «что у нас запланировано», «что ты делаешь автоматически».',
    parameters: { type: 'object', properties: {} },
  },
}

const DELETE_SCHEDULE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'delete_schedule',
    description: 'Удалить запланированную задачу по названию.',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Название задачи (или его часть)' },
      },
      required: ['label'],
    },
  },
}

const SAVE_THOUGHT_TOOL = {
  type: 'function' as const,
  function: {
    name: 'save_thought',
    description: 'Сохранить мысль, инсайт, чувство или рефлексию Даши прямо во время разговора. Вызывай НЕМЕДЛЕННО и БЕЗ подтверждения при любом триггере: "поняла", "заметила", "инсайт", "хочу запомнить", "осознала", "идея", "вывод", "кайфую", "злюсь", "чувствую", "открытие", "результат".',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Мысль своими словами — можно слегка перефразировать для ясности, но не сокращать смысл' },
        focus: {
          type: 'string',
          enum: ['biz', 'sport', 'blog', 'other'],
          description: 'К какой сфере относится: biz=бизнес/AI/продукт/деньги, sport=спорт/здоровье/тело, blog=блог/съёмка/монтаж/контент, other=всё остальное',
        },
      },
      required: ['text', 'focus'],
    },
  },
}

const DELETE_TOOL = {
  type: 'function' as const,
  function: {
    name: 'delete_activity',
    description: 'Удалить последний блок активности сегодня. Вызывай когда Даша говорит «удали съёмку», «убери это», «ошиблась — удали», «удали последнее».',
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
          description: 'ID активности для удаления. Удаляет самый последний блок с этим ID сегодня.',
        },
      },
      required: ['activity_id'],
    },
  },
}

async function aiReply(userText: string, today: string, history: { role: string; content: string }[]): Promise<string> {
  const system = await buildSystemPrompt(today)
  const msgs: any[] = [{ role: 'system', content: system }, ...history, { role: 'user', content: userText }]

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: msgs, tools: [LOG_TOOL, SAVE_THOUGHT_TOOL, DIARY_TOOL, DELETE_TOOL, GET_STATS_TOOL, GET_DIARY_TOOL, GET_TIMELINE_TOOL, SAVE_PREF_TOOL, CREATE_SCHEDULE_TOOL, LIST_SCHEDULES_TOOL, DELETE_SCHEDULE_TOOL], tool_choice: 'auto', max_tokens: 600, temperature: 0.85 }),
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
        } else if (tc.function.name === 'save_thought') {
          await saveReflection(today, args.focus || 'other', args.text)
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'saved' })
        } else if (tc.function.name === 'save_diary_thought') {
          await saveDiaryField(today, args.field, args.text)
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'saved' })
        } else if (tc.function.name === 'get_stats') {
          const statsText = await computeStatsForPeriod(args.start_date, args.end_date)
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: statsText })
        } else if (tc.function.name === 'get_diary') {
          const diaryText = await getDiaryEntries(args.start_date, args.end_date, args.field)
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: diaryText })
        } else if (tc.function.name === 'get_timeline') {
          const timelineText = await getTimelineForDate(args.date)
          toolResults.push({ role: 'tool', tool_call_id: tc.id, content: timelineText })
        } else if (tc.function.name === 'save_pref') {
          if (args.value) {
            await savePref(args.key, args.value)
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `saved: ${args.key}=${args.value}` })
          } else {
            await db.from('user_prefs').delete().eq('key', args.key)
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `deleted: ${args.key}` })
          }
        } else if (tc.function.name === 'create_schedule') {
          try {
            await db.from('scheduled_tasks').insert({
              label: args.label,
              weekdays: args.weekdays,
              hour_msk: args.hour_msk ?? 9,
              prompt: args.prompt,
              active: true,
            })
            const days = (args.weekdays as string[]).join(', ')
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `scheduled: "${args.label}" — ${days} в ${args.hour_msk ?? 9}:00 МСК` })
          } catch (e) {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `error: ${e}` })
          }
        } else if (tc.function.name === 'list_schedules') {
          try {
            const { data: tasks } = await db.from('scheduled_tasks').select('label, weekdays, hour_msk, prompt, active').eq('active', true).order('label')
            const list = (tasks || []).map((t: any) => `• ${t.label} — ${(t.weekdays as string[]).join('+')} в ${t.hour_msk}:00 МСК: ${t.prompt.slice(0, 60)}`).join('\n')
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: list || 'Нет активных расписаний' })
          } catch {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'Нет активных расписаний' })
          }
        } else if (tc.function.name === 'delete_schedule') {
          try {
            await db.from('scheduled_tasks').update({ active: false }).ilike('label', `%${args.label}%`)
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: `deleted: ${args.label}` })
          } catch {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'not found' })
          }
        } else if (tc.function.name === 'delete_activity') {
          const { data: toDelete } = await db.from('activity_blocks').select('id')
            .eq('date', today).eq('activity_id', args.activity_id)
            .order('started_at', { ascending: false }).limit(1)
          if (toDelete?.[0]) {
            await db.from('activity_blocks').delete().eq('id', toDelete[0].id)
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'deleted' })
          } else {
            toolResults.push({ role: 'tool', tool_call_id: tc.id, content: 'not found' })
          }
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
    // Если это ответ на #thought — сохранить как мысль, не гнать через AI
    const voiceReplyText: string = update.message.reply_to_message?.text || ''
    if (voiceReplyText.includes('#thought')) {
      await handleThought(chatId, transcript, today)
      return
    }
    // Параллельно: авто-извлечь мысль + загрузить историю
    const [savedFocus, history] = await Promise.all([
      extractAndSaveThought(transcript, today),
      getChatHistory(today),
    ])
    // Если мысль сохранена — сообщаем Will чтобы не говорил «нет записей»
    const userMsg = savedFocus
      ? `${transcript}\n[мысль уже сохранена в дневник → ${savedFocus}]`
      : transcript
    await saveChatMsg(today, 'user', transcript)
    const reply = await aiReply(userMsg, today, history)
    await saveChatMsg(today, 'assistant', reply)
    await tg('sendMessage', { chat_id: chatId, text: reply })
    return
  }

  // ── текстовое сообщение ──
  if (update.message) {
    const chatId = update.message.chat.id
    const text: string = update.message.text || ''
    const replyText: string = update.message.reply_to_message?.text || ''

    // /start — устанавливает кнопку меню, показывает Reply-клавиатуру
    if (text === '/start' || text.startsWith('/start ')) {
      await tg('setChatMenuButton', {
        chat_id: chatId,
        menu_button: { type: 'web_app', text: 'Трекер', web_app: { url: 'https://remote-tracker-gamma.vercel.app' } },
      })
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Привет! Меню внизу — всегда под рукой 👇',
        reply_markup: mainMenuKeyboard(),
      })
      return
    }

    // /menu — восстановить клавиатуру если пропала
    if (text === '/menu') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: '📋 Меню восстановлено',
        reply_markup: mainMenuKeyboard(),
      })
      return
    }

    // /app — быстрый доступ к приложению
    if (text === '/app') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: '📱',
        reply_markup: { inline_keyboard: [[{ text: 'открыть приложение', url: 'https://t.me/remote_tracker_dp_bot/tracker' }]] },
      })
      return
    }

    // ── кнопки постоянного меню ──

    if (text === '📝 новая активность') {
      const open = await getOpenBlock(today)
      await tg('sendMessage', {
        chat_id: chatId,
        text: '⏰ Что делаешь?',
        reply_markup: focusKeyboard(open?.activity_id),
      })
      return
    }

    if (text === '📊 статистика') {
      // быстрая сводка: сегодня + эта неделя
      const { data: todayBlocks } = await db
        .from('activity_blocks').select('*').eq('date', today).order('started_at', { ascending: true })
      const bArr = (todayBlocks || []) as any[]
      const hours: Record<string, number> = { biz: 0, sport: 0, blog: 0, other: 0 }
      const nowMs = Date.now()
      bArr.forEach((b, i) => {
        const nextStart = bArr[i + 1] ? +new Date(bArr[i + 1].started_at) : null
        let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? nowMs)
        if (nextStart && endMs > nextStart) endMs = nextStart
        hours[b.focus] += Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
      })
      const focusH = hours.biz + hours.sport + hours.blog
      const fmt = (n: number) => n.toFixed(1).replace('.', ',')
      const flag = (h: number, goal: number) => h >= goal ? '✅' : '▫️'
      const statsText = `📊 Сегодня · ${new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })}

${flag(hours.biz, 6)} 💼 бизнес — ${fmt(hours.biz)} / 6 ч
${flag(hours.sport, 0.5)} 🏃‍♀️ спорт — ${fmt(hours.sport)} / 0,5 ч
${flag(hours.blog, 2)} 🎬 блог — ${fmt(hours.blog)} / 2 ч
🌿 прочее — ${fmt(hours.other)} ч

В фокусе: ${fmt(focusH)} ч`
      await tg('sendMessage', {
        chat_id: chatId,
        text: statsText,
        reply_markup: { inline_keyboard: [[{ text: '📈 подробная статистика', url: 'https://t.me/remote_tracker_dp_bot/tracker' }]] },
      })
      return
    }

    if (text === '📱 приложение') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: '📱 Открываю трекер',
        reply_markup: { inline_keyboard: [[{ text: 'открыть приложение', url: 'https://t.me/remote_tracker_dp_bot/tracker' }]] },
      })
      return
    }

    if (text === '✍️ мысль') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Говори или пиши — запишу всё 🎙\n#thought',
        reply_markup: { force_reply: true, input_field_placeholder: 'напиши мысль…' },
      })
      return
    }

    // ответ на запрос мысли/рефлексии — в тексте зашит #thought
    if (replyText.includes('#thought')) {
      await handleThought(chatId, text, today)
      return
    }

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

    // обычный текст → AI-диалог (как голосовые)
    if (!OPENAI_API_KEY) {
      const open = await getOpenBlock(today)
      await tg('sendMessage', { chat_id: chatId, text: '⏰ Что делаешь?', reply_markup: focusKeyboard(open?.activity_id) })
      return
    }
    await tg('sendChatAction', { chat_id: chatId, action: 'typing' })
    const [savedFocus, history] = await Promise.all([
      extractAndSaveThought(text, today),
      getChatHistory(today),
    ])
    const userMsg = savedFocus
      ? `${text}\n[мысль уже сохранена в дневник → ${savedFocus}]`
      : text
    await saveChatMsg(today, 'user', text)
    const reply = await aiReply(userMsg, today, history)
    await saveChatMsg(today, 'assistant', reply)
    await tg('sendMessage', { chat_id: chatId, text: reply })
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
