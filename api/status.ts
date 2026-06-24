import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, actLabel, ACT_TO_FOCUS } from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default async function handler(_req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')

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
    hours[b.focus] += Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
  })

  const openBlock = bArr.find((b: any) => !b.ended_at)
  const current = openBlock ? actLabel(openBlock.activity_id) : null
  const currentFocus = openBlock ? (ACT_TO_FOCUS[openBlock.activity_id] || null) : null

  res.status(200).json({ current, currentFocus, hours, goals: { biz: 6, sport: 0.5, blog: 2 } })
}
