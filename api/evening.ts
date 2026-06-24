import { createClient } from '@supabase/supabase-js'
import { tg, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default async function handler(_req: any, res: any) {
  if (!CHAT_ID) return res.status(400).end()

  const today = new Date().toISOString().slice(0, 10)

  // Пропустить если уже отправляли сегодня (ищем маркер в chat_messages)
  const { data: msgs } = await db
    .from('chat_messages')
    .select('content')
    .eq('date', today)
    .eq('role', 'assistant')
    .ilike('content', '%Давай закроем день%')
    .limit(1)
  if (msgs && msgs.length > 0) {
    return res.status(200).json({ skipped: 'already sent today' })
  }

  // Собираем итоги дня для контекста
  const { data: blockData } = await db
    .from('activity_blocks')
    .select('focus, started_at, ended_at')
    .eq('date', today)
    .order('started_at', { ascending: true })

  const bArr = (blockData || []) as any[]
  const hours: Record<string, number> = { biz: 0, sport: 0, blog: 0, other: 0 }
  const dayEndMs = Date.now()
  bArr.forEach((b, i) => {
    const nextStart = bArr[i + 1] ? +new Date(bArr[i + 1].started_at) : null
    let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? dayEndMs)
    if (nextStart && endMs > nextStart) endMs = nextStart
    hours[b.focus] += Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
  })

  const focusH = hours.biz + hours.sport + hours.blog
  const statsLine = bArr.length > 0
    ? `\nСегодня в фокусе: ${focusH.toFixed(1)} ч (💼 ${hours.biz.toFixed(1)} · 🏃‍♀️ ${hours.sport.toFixed(1)} · 🎬 ${hours.blog.toFixed(1)})\n`
    : ''

  const text = `🌙 Давай закроем день!${statsLine}
Ответь голосом — можно всё одним сообщением:

1. Что сделала сегодня?
2. Главные победы?
3. Что не получилось?
4. Мысли и уроки дня?
5. Цели на завтра?`

  await tg('sendMessage', { chat_id: CHAT_ID, text })

  // Сохраняем в chat_messages — чтобы Will видел контекст когда она ответит
  await db.from('chat_messages').insert({ date: today, role: 'assistant', content: text })

  res.status(200).json({ ok: true })
}
