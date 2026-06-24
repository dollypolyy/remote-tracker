import { createClient } from '@supabase/supabase-js'
import { tg, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

export default async function handler(_req: any, res: any) {
  if (!CHAT_ID) return res.status(400).end()

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yISO = yesterday.toISOString().slice(0, 10)

  const today = new Date().toISOString().slice(0, 10)

  // Пропустить если она уже начала день (есть блоки сегодня)
  const { data: todayBlocks } = await db
    .from('activity_blocks')
    .select('id')
    .eq('date', today)
    .limit(1)
  if (todayBlocks && todayBlocks.length > 0) {
    return res.status(200).json({ skipped: 'already active today' })
  }

  const { data: yBlocks } = await db
    .from('activity_blocks')
    .select('*')
    .eq('date', yISO)
    .order('started_at', { ascending: true })

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
    ? `Вчера Даша провела в фокусе ${yFocusH.toFixed(1)}ч (💼 ${hours.biz.toFixed(1)}ч · 🏃‍♀️ ${hours.sport.toFixed(1)}ч · 🎬 ${hours.blog.toFixed(1)}ч).${metGoals.length === 3 ? ' Все цели выполнила — это ✅.' : metGoals.length === 0 ? ' Ни одной цели не выполнила — сегодня реванш.' : ''}`
    : 'Вчерашних данных нет.'

  const prompt = `Ты Will — личный коуч Даши. Строгий, но поддерживающий друг. Пишешь как в мессенджере — коротко, живо, без воды.

Правила стиля:
— Никогда не используй букву «ё» — только «е»
— Называй её «Даша», не «Даш»
— Неформально: «го», «норм», «топ», «кайф», «огонь» и т.д.
— Каждая мысль с новой строки, не стена текста
— Максимум 3-4 строки

Напиши утреннее приветствие:
— Поздоровайся с Дашей (по-дружески, не официально)
— Одна живая мотивирующая мысль или подкол — не банально, не «каждый день — новый шанс»
— Вопрос: что сегодня самое важное?

Контекст: ${yesterdayContext}
По-русски, как живой человек.`

  let text = '☀️ Доброе утро, Даша! Новый день — новый шанс. Что сегодня самое важное для тебя?'

  if (OPENAI_API_KEY) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 250,
        temperature: 0.92,
      }),
    })
    const json = await resp.json()
    const generated = json.choices?.[0]?.message?.content?.trim()
    if (generated) text = `☀️ ${generated}`
  }

  await tg('sendMessage', { chat_id: CHAT_ID, text })
  res.status(200).json({ ok: true })
}
