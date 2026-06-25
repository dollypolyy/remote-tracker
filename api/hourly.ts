import { createClient } from '@supabase/supabase-js'
import { tg, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'
import { computeStatsForPeriod, getDiaryEntries } from './webhook.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export default async function handler(_req: any, res: any) {
  if (!CHAT_ID) return res.status(400).end()

  const now = new Date()
  const utcHour = now.getUTCHours()
  const mskHour = (utcHour + 3) % 24
  // При переходе через полночь МСК — день сдвигается
  const mskDayOffset = utcHour + 3 >= 24 ? 1 : 0
  const mskWeekday = WEEKDAY_KEYS[(now.getUTCDay() + mskDayOffset) % 7]
  // Дата по МСК для dedup (чтобы не запускать задачу дважды в один день)
  const mskNow = new Date(now.getTime() + 3 * 3_600_000)
  const today = mskNow.toISOString().slice(0, 10)

  let tasks: any[] = []
  try {
    const { data } = await db
      .from('scheduled_tasks')
      .select('*')
      .eq('active', true)
      .eq('hour_msk', mskHour)
    tasks = (data || []) as any[]
  } catch {
    return res.status(200).json({ ok: true, skipped: 'no table' })
  }

  const due = tasks.filter(t => {
    if (t.last_run_date === today) return false
    const weekdays = t.weekdays as string[]
    return weekdays.includes('*') || weekdays.includes(mskWeekday)
  })

  for (const task of due) {
    try {
      // Собираем контекст: статистика недели + последние мысли
      const start7 = new Date(mskNow)
      start7.setDate(start7.getDate() - 7)
      const start7ISO = start7.toISOString().slice(0, 10)
      const [statsText, diaryText] = await Promise.all([
        computeStatsForPeriod(start7ISO, today),
        getDiaryEntries(start7ISO, today, 'reflections').catch(() => ''),
      ])

      const msgPrompt = `Ты Will — личный AI-коуч Даши. Стиль: неформально, коротко, по делу. Без буквы «ё». Называй «Даша».

Задача: ${task.prompt}

Данные для контекста:
Статистика недели:
${statsText}

Мысли из дневника:
${diaryText || '(нет записей)'}

Напиши сообщение. Максимум 8 строк. Один живой инсайт по данным.`

      if (!OPENAI_API_KEY) continue
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: msgPrompt }], max_tokens: 400, temperature: 0.88 }),
      })
      const json = await resp.json()
      const text = json.choices?.[0]?.message?.content?.trim()

      if (text) {
        await tg('sendMessage', { chat_id: CHAT_ID, text: `⏰ ${task.label}\n\n${text}` })
      }

      await db.from('scheduled_tasks').update({ last_run_date: today }).eq('id', task.id)
    } catch (e) {
      console.error('scheduled task error', task.label, e)
    }
  }

  res.status(200).json({ ok: true, hour: mskHour, weekday: mskWeekday, ran: due.length })
}
