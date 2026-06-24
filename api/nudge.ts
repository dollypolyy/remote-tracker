import { createClient } from '@supabase/supabase-js'
import { tg, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

export default async function handler(_req: any, res: any) {
  if (!CHAT_ID) return res.status(400).end()

  const now = new Date()
  const mskHour = (now.getUTCHours() + 3) % 24

  // Только в активные часы 09:00–20:00 МСК
  if (mskHour < 9 || mskHour >= 20) {
    return res.status(200).json({ skipped: 'outside hours' })
  }

  const today = now.toISOString().slice(0, 10)

  // Проверяем последнюю активность и последний nudge
  const [{ data: lastBlock }, { data: diary }] = await Promise.all([
    db.from('activity_blocks').select('started_at').eq('date', today)
      .order('started_at', { ascending: false }).limit(1),
    db.from('diary_entries').select('last_nudge_at').eq('date', today).maybeSingle(),
  ])

  const lastActivityMs = lastBlock?.[0]?.started_at ? +new Date(lastBlock[0].started_at) : 0
  const lastNudgeMs = (diary as any)?.last_nudge_at ? +new Date((diary as any).last_nudge_at) : 0
  const inactiveMin = (Date.now() - lastActivityMs) / 60_000
  const sinceNudgeMin = (Date.now() - lastNudgeMs) / 60_000

  // Нудж только если: молчание > 60 мин И с последнего нуджа > 90 мин
  if (inactiveMin < 60 || sinceNudgeMin < 90) {
    return res.status(200).json({ skipped: 'not needed', inactiveMin: inactiveMin.toFixed(0), sinceNudgeMin: sinceNudgeMin.toFixed(0) })
  }

  const prompt = `Ты Will — поддерживающий друг-коуч Даши. Пишешь как в мессенджере.
Правила: никогда «ё», неформально, каждая мысль с новой строки, максимум 2 строки.

Даша не отмечала активность уже ${Math.round(inactiveMin)} минут.
Напиши дружеский вопрос-напоминание — что делаешь? Не осуждай, просто уточни.
По-русски, как сообщение другу.`

  let text = `Даш, что делаешь? 👀\nУже ${Math.round(inactiveMin)} мин без активности — отметь что происходит`

  if (OPENAI_API_KEY) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.9,
      }),
    })
    const json = await resp.json()
    const generated = json.choices?.[0]?.message?.content?.trim()
    if (generated) text = generated
  }

  await tg('sendMessage', { chat_id: CHAT_ID, text })

  // Сохраняем время последнего нуджа
  if (diary) {
    await db.from('diary_entries').update({ last_nudge_at: new Date().toISOString() }).eq('date', today)
  } else {
    await db.from('diary_entries').insert({ date: today, last_nudge_at: new Date().toISOString() })
  }

  res.status(200).json({ ok: true, inactiveMin: inactiveMin.toFixed(0) })
}
