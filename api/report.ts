import { createClient } from '@supabase/supabase-js'
import { tg, CHAT_ID, FOCUS_LABELS, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const APP_URL = 'https://remote-tracker-gamma.vercel.app'
const GOALS: Record<string, number> = { biz: 6, sport: 0.5, blog: 2 }

export default async function handler(_req: any, res: any) {
  if (!CHAT_ID) return res.status(400).json({ error: 'no chat id' })

  const today = new Date().toISOString().slice(0, 10)
  const { data } = await db
    .from('activity_blocks')
    .select('*')
    .eq('date', today)
    .order('started_at', { ascending: true })

  const blocks = data || []
  const now = Date.now()
  const hours: Record<string, number> = { biz: 0, sport: 0, blog: 0, other: 0 }

  blocks.forEach((b: any, i: number) => {
    const nextStart = blocks[i + 1] ? +new Date(blocks[i + 1].started_at) : null
    let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? now)
    if (nextStart != null && endMs > nextStart) endMs = nextStart
    hours[b.focus] += Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
  })

  const fmt = (k: string) => {
    const done = hours[k]
    const goal = GOALS[k]
    const ok = done >= goal ? '✅' : '▫️'
    return `${ok} ${FOCUS_LABELS[k]} — ${done.toFixed(1)} / ${goal} ч`
  }

  const focusH = hours.biz + hours.sport + hours.blog
  const priorityKey = Object.keys(hours).reduce((a, b) => (hours[b] > hours[a] ? b : a), 'biz')

  const dateLabel = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', timeZone: 'Europe/Moscow',
  })

  const text =
    `🌙 Итоги дня · ${dateLabel}\n\n` +
    `${fmt('biz')}\n${fmt('sport')}\n${fmt('blog')}\n` +
    `🌿 вне фокуса — ${hours.other.toFixed(1)} ч\n\n` +
    `В фокусе сегодня: ${focusH.toFixed(1)} ч\n` +
    `Главное: ${FOCUS_LABELS[priorityKey]}\n\n` +
    `✍️ Запиши дневник за сегодня — как прошёл день, настроение, цели на завтра.`

  await tg('sendMessage', {
    chat_id: CHAT_ID,
    text,
    reply_markup: {
      inline_keyboard: [[{ text: '✍️ открыть дневник', url: APP_URL }]],
    },
  })

  res.status(200).json({ ok: true, hours })
}
