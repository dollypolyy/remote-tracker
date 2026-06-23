import { createClient } from '@supabase/supabase-js'
import { tg, focusKeyboard, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export default async function handler(req: any, res: any) {
  if (!CHAT_ID) return res.status(400).json({ error: 'TELEGRAM_CHAT_ID not set' })

  // Проверяем активные часы 08:00–20:30 МСК (UTC+3)
  const now = new Date()
  const mskMin = (now.getUTCHours() + 3) % 24 * 60 + now.getUTCMinutes()
  if (mskMin < 8 * 60 || mskMin > 20 * 60 + 30) {
    return res.status(200).json({ skipped: 'outside active hours' })
  }

  const today = now.toISOString().slice(0, 10)
  const { data } = await db
    .from('activity_blocks')
    .select('activity_id')
    .eq('date', today)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)

  const currentActId: string | null = data?.[0]?.activity_id ?? null
  const timeStr = now.toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  })

  await tg('sendMessage', {
    chat_id: CHAT_ID,
    text: `⏰ Что делаешь? (${timeStr})`,
    reply_markup: focusKeyboard(currentActId),
  })

  res.status(200).json({ ok: true, time: timeStr })
}
