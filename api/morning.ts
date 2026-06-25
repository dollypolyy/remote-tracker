import { createClient } from '@supabase/supabase-js'
import { tg, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'
import { computeStatsForPeriod } from './webhook.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

async function gpt(prompt: string, maxTokens = 300): Promise<string> {
  if (!OPENAI_API_KEY) return ''
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0.9 }),
  })
  const json = await resp.json()
  return json.choices?.[0]?.message?.content?.trim() || ''
}

export default async function handler(_req: any, res: any) {
  if (!CHAT_ID) return res.status(400).end()

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const todayWeekday = WEEKDAY_KEYS[now.getUTCDay()]

  // Загружаем настройки пользователя
  let prefs: { key: string; value: string }[] = []
  try {
    const { data } = await db.from('user_prefs').select('key, value')
    prefs = (data || []) as { key: string; value: string }[]
  } catch { /* таблица ещё не создана */ }

  // Проверяем запланированный отчёт на сегодня
  const scheduledReport = prefs.find(p => p.key === `schedule_${todayWeekday}`)
  if (scheduledReport) {
    const start7 = new Date(now)
    start7.setDate(start7.getDate() - 7)
    const startISO = start7.toISOString().slice(0, 10)
    const statsText = await computeStatsForPeriod(startISO, today)

    const reportPrompt = `Ты Will — личный коуч Даши. Стиль: неформально, коротко, по делу. Без «ё».

Даша настроила еженедельный отчёт: "${scheduledReport.value}"

Данные за неделю:
${statsText}

Напиши отчёт в соответствии с её запросом. Максимум 8 строк. Добавь один живой инсайт или совет по данным.`

    const reportText = await gpt(reportPrompt, 400)
    if (reportText) {
      await tg('sendMessage', { chat_id: CHAT_ID, text: `📊 Еженедельный отчёт\n\n${reportText}` })
    }
  }

  // Утреннее приветствие — пропустить если уже активна сегодня
  const { data: todayBlocks } = await db
    .from('activity_blocks').select('id').eq('date', today).limit(1)
  if (todayBlocks && todayBlocks.length > 0) {
    return res.status(200).json({ skipped: 'already active today', scheduledReport: !!scheduledReport })
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yISO = yesterday.toISOString().slice(0, 10)

  const { data: yBlocks } = await db
    .from('activity_blocks').select('*').eq('date', yISO).order('started_at', { ascending: true })

  const hours: Record<string, number> = { biz: 0, sport: 0, blog: 0, other: 0 }
  const bArr = (yBlocks || []) as any[]
  const dayEnd = +new Date(`${yISO}T20:30:00+03:00`)
  bArr.forEach((b, i) => {
    const nextStart = bArr[i + 1] ? +new Date(bArr[i + 1].started_at) : null
    let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? dayEnd)
    if (nextStart && endMs > nextStart) endMs = nextStart
    hours[b.focus] = (hours[b.focus] || 0) + Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
  })

  const yFocusH = hours.biz + hours.sport + hours.blog
  const metGoals = [
    hours.biz >= 6 ? '💼' : null,
    hours.sport >= 0.5 ? '🏃‍♀️' : null,
    hours.blog >= 2 ? '🎬' : null,
  ].filter(Boolean)

  const yesterdayContext = bArr.length > 0
    ? `Вчера: ${yFocusH.toFixed(1)}ч в фокусе (💼${hours.biz.toFixed(1)} 🏃‍♀️${hours.sport.toFixed(1)} 🎬${hours.blog.toFixed(1)}).${metGoals.length === 3 ? ' Все цели ✅.' : metGoals.length === 0 ? ' Целей нет — сегодня реванш.' : ''}`
    : 'Вчерашних данных нет.'

  const greetPrompt = `Ты Will — личный коуч Даши. Пишешь как в мессенджере — коротко, живо, без воды. Без «ё». Называй «Даша».

Напиши утреннее приветствие:
— Поздоровайся (по-дружески, не официально)
— Одна живая мотивирующая мысль или подкол — не банально
— Один вопрос: что сегодня самое важное?

Контекст: ${yesterdayContext}
3-4 строки максимум.`

  const greeting = await gpt(greetPrompt, 250)
  const text = greeting ? `☀️ ${greeting}` : '☀️ Доброе утро, Даша! Что сегодня самое важное?'

  await tg('sendMessage', { chat_id: CHAT_ID, text })
  res.status(200).json({ ok: true, scheduledReport: !!scheduledReport })
}
