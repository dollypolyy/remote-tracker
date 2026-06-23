import { createClient } from '@supabase/supabase-js'
import {
  tg, actLabel, activityKeyboard, focusKeyboard,
  ACT_TO_FOCUS, FOCUS_LABELS, SUPABASE_URL, SUPABASE_ANON_KEY,
} from './_bot'

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function getOpenBlock(today: string) {
  const { data } = await db
    .from('activity_blocks')
    .select('*')
    .eq('date', today)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

async function openBlock(activityId: string, focus: string) {
  const today = new Date().toISOString().slice(0, 10)
  await db
    .from('activity_blocks')
    .update({ ended_at: new Date().toISOString() })
    .eq('date', today)
    .is('ended_at', null)
  await db.from('activity_blocks').insert({
    date: today,
    started_at: new Date().toISOString(),
    activity_id: activityId,
    focus,
  })
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end()
  res.status(200).end() // быстрый ответ Telegram (< 1 сек)

  const update = req.body
  const today = new Date().toISOString().slice(0, 10)

  try {
    // любое сообщение → ответить chat_id (нужно для первоначальной настройки)
    if (update.message) {
      const chatId = update.message.chat.id
      await tg('sendMessage', {
        chat_id: chatId,
        text: `👋 Твой chat_id: \`${chatId}\`\n\nДобавь в Vercel → Settings → Environment Variables → TELEGRAM_CHAT_ID`,
        parse_mode: 'Markdown',
      })
      return
    }

    if (!update.callback_query) return

    const cbq = update.callback_query
    const chatId = cbq.message.chat.id
    const messageId = cbq.message.message_id
    const data: string = cbq.data

    await tg('answerCallbackQuery', { callback_query_id: cbq.id })

    if (data === 'cont') {
      const open = await getOpenBlock(today)
      const label = open ? actLabel(open.activity_id) : null
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: label ? `✅ Продолжаешь: ${label}` : '✅ Продолжаешь',
      })
      return
    }

    if (data === 'back') {
      const open = await getOpenBlock(today)
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: '⏰ Что делаешь?',
        reply_markup: focusKeyboard(open?.activity_id),
      })
      return
    }

    if (data.startsWith('f:')) {
      const focus = data.slice(2)
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `${FOCUS_LABELS[focus]} — выбери активность:`,
        reply_markup: activityKeyboard(focus),
      })
      return
    }

    if (data.startsWith('a:')) {
      const actId = data.slice(2)
      const focus = ACT_TO_FOCUS[actId] || 'other'
      await openBlock(actId, focus)
      const label = actLabel(actId)
      const mskTime = new Date().toLocaleTimeString('ru-RU', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
      })
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `✅ ${label} · ${FOCUS_LABELS[focus]}\nНачало: ${mskTime} МСК`,
      })
    }
  } catch (e) {
    console.error('webhook error', e)
  }
}
