import { createClient } from '@supabase/supabase-js'
import { tg, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

export default async function handler(_req: any, res: any) {
  if (!CHAT_ID) return res.status(400).end()

  const today = new Date().toISOString().slice(0, 10)
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
    hours[b.focus] = (hours[b.focus] || 0) + Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
  })

  const focusH = hours.biz + hours.sport + hours.blog

  // Не отправлять если уже хорошо двигается
  if (focusH >= 1.5) return res.status(200).json({ ok: true, skipped: true, focusH })

  const prompt = `Ты Will — личный коуч Даши (в стиле Will Smith).
Сейчас 13:00, половина дня прошла. Даша сегодня в фокусе только ${focusH.toFixed(1)}ч из 8.5ч цели.
Напиши 2 предложения: мягко, с юмором, конкретно подтолкни её включиться. Не занудствуй. По-русски.`

  let text = `⏰ Даша, уже 13:00! ${focusH.toFixed(1)}ч в фокусе — время разгоняться 💪`

  if (OPENAI_API_KEY) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.9,
      }),
    })
    const json = await resp.json()
    const generated = json.choices?.[0]?.message?.content?.trim()
    if (generated) text = `⏰ ${generated}`
  }

  await tg('sendMessage', { chat_id: CHAT_ID, text })
  res.status(200).json({ ok: true, focusH })
}
