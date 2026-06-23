// Диагностика: что происходит с ботом и переменными окружения.
import { tg, BOT_TOKEN, CHAT_ID, SUPABASE_URL, SUPABASE_ANON_KEY } from './_bot.js'

export default async function handler(_req: any, res: any) {
  const info = await tg('getWebhookInfo', {})
  res.status(200).json({
    env: {
      BOT_TOKEN: BOT_TOKEN ? `есть (${BOT_TOKEN.slice(0, 6)}…)` : 'НЕТ',
      TELEGRAM_CHAT_ID: CHAT_ID || 'НЕТ',
      SUPABASE_URL: SUPABASE_URL ? 'есть' : 'НЕТ',
      SUPABASE_ANON_KEY: SUPABASE_ANON_KEY ? 'есть' : 'НЕТ',
    },
    webhook: info,
  })
}
