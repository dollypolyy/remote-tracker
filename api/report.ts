import { createClient } from '@supabase/supabase-js'
import { tg, CHAT_ID, FOCUS_LABELS, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const APP_URL = 'https://remote-tracker-gamma.vercel.app'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
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
  const dateLabel = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', timeZone: 'Europe/Moscow',
  })

  const statsBlock =
    `🌙 Итоги дня · ${dateLabel}\n\n` +
    `${fmt('biz')}\n${fmt('sport')}\n${fmt('blog')}\n` +
    `🌿 прочее — ${hours.other.toFixed(1)} ч\n\n` +
    `В фокусе: ${focusH.toFixed(1)} ч`

  // Личное напутствие от Will через GPT
  let willMessage = ''
  if (OPENAI_API_KEY) {
    const metGoals = Object.entries(GOALS).filter(([k, g]) => hours[k] >= g).map(([k]) => FOCUS_LABELS[k])
    const missedGoals = Object.entries(GOALS).filter(([k, g]) => hours[k] < g)
      .map(([k, g]) => `${FOCUS_LABELS[k]}: ${hours[k].toFixed(1)}ч из ${g}ч`)

    const prompt = `Ты Will — поддерживающий друг-коуч Даши. Пишешь вечернее напутствие.
Правила стиля: никогда «ё», неформально, каждая мысль с новой строки, максимум 4 строки.

Данные дня:
Выполнено: ${metGoals.length ? metGoals.join(', ') : 'ничего'}
Не выполнено: ${missedGoals.length ? missedGoals.join(', ') : 'всё сделала!'}
Итого в фокусе: ${focusH.toFixed(1)}ч

Напиши:
1. Одну фразу — что было круто (или общий итог если все плохо — всё равно найди что-то позитивное)
2. Одну конкретную рекомендацию на завтра
3. Короткое закрытие — «спокойной ночи» по-дружески

По-русски, как сообщение другу.`

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.9,
      }),
    })
    const json = await resp.json()
    const generated = json.choices?.[0]?.message?.content?.trim()
    if (generated) willMessage = `\n\n${generated}`
  }

  await tg('sendMessage', {
    chat_id: CHAT_ID,
    text: statsBlock + willMessage,
    reply_markup: {
      inline_keyboard: [[{ text: '✍️ открыть дневник', url: APP_URL }]],
    },
  })

  res.status(200).json({ ok: true, hours })
}
