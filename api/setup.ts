// Одноразовый эндпоинт: зарегистрировать webhook в Telegram.
// Открыть в браузере один раз после деплоя.
import { tg, BOT_TOKEN } from './_bot.js'

export default async function handler(req: any, res: any) {
  if (!BOT_TOKEN) return res.status(400).json({ error: 'BOT_TOKEN not set in Vercel env vars' })

  const host = req.headers.host || ''
  const webhookUrl = `https://${host}/api/webhook`

  const result = await tg('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
  })

  res.status(200).json({ webhookUrl, telegramResponse: result })
}
