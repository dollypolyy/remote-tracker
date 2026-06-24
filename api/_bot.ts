// Shared bot utilities — не является роутом (prefix _)

export const BOT_TOKEN = process.env.BOT_TOKEN || ''
export const CHAT_ID = process.env.TELEGRAM_CHAT_ID || ''
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || ''

export async function tg(method: string, body: object): Promise<any> {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return r.json()
}

export const ACTS_BY_FOCUS: Record<string, { id: string; label: string }[]> = {
  biz: [
    { id: 'biz_research', label: 'поиск' },
    { id: 'biz_plan',     label: 'планирование' },
    { id: 'biz_learn',    label: 'обучение' },
    { id: 'biz_build',    label: 'делаю продукт' },
    { id: 'biz_calls',    label: 'созвоны' },
    { id: 'biz_strategy', label: 'стратегия' },
  ],
  sport: [
    { id: 'sport_gym',   label: 'зал' },
    { id: 'sport_home',  label: 'тренировка дома' },
    { id: 'sport_walk',  label: 'прогулка' },
    { id: 'sport_run',   label: 'пробежка' },
    { id: 'sport_dance', label: 'танцы' },
    { id: 'sport_yoga',  label: 'йога' },
    { id: 'sport_other', label: 'другая активность' },
  ],
  blog: [
    { id: 'blog_idea', label: 'идея и сценарий' },
    { id: 'blog_film', label: 'съёмка' },
    { id: 'blog_edit', label: 'монтаж' },
    { id: 'blog_post', label: 'публикация' },
  ],
  other: [
    { id: 'other_cook',     label: 'готовка' },
    { id: 'other_eat',      label: 'еда' },
    { id: 'other_study',    label: 'учёба' },
    { id: 'other_chores',   label: 'быт' },
    { id: 'other_rest',     label: 'отдых' },
    { id: 'other_road',     label: 'дорога' },
    { id: 'other_scroll',   label: 'залипание' },
    { id: 'other_personal', label: 'личное' },
  ],
}

export const FOCUS_LABELS: Record<string, string> = {
  biz:   '💼 бизнес',
  sport: '🏃‍♀️ спорт',
  blog:  '🎬 блог',
  other: '🌿 прочее',
}

export const ACT_TO_FOCUS: Record<string, string> = Object.entries(ACTS_BY_FOCUS)
  .flatMap(([focus, acts]) => acts.map((a) => [a.id, focus] as [string, string]))
  .reduce<Record<string, string>>((acc, [id, focus]) => ({ ...acc, [id]: focus }), {})

export function actLabel(actId: string): string {
  return Object.values(ACTS_BY_FOCUS).flat().find((a) => a.id === actId)?.label || actId
}

export function focusKeyboard(currentActId?: string | null) {
  const rows: { text: string; callback_data: string }[][] = [
    [
      { text: '💼 бизнес', callback_data: 'f:biz' },
      { text: '🏃‍♀️ спорт',  callback_data: 'f:sport' },
    ],
    [
      { text: '🎬 блог',   callback_data: 'f:blog' },
      { text: '🌿 прочее', callback_data: 'f:other' },
    ],
  ]
  if (currentActId) {
    rows.push([{ text: `✅ продолжаю — ${actLabel(currentActId)}`, callback_data: 'cont' }])
  }
  rows.push([{ text: '📱 открыть приложение', url: 'https://t.me/remote_tracker_dp_bot/tracker' }])
  return { inline_keyboard: rows }
}

// Клавиатура «когда началось?» — пресеты «N минут назад» + ручной ввод
export function timeKeyboard(actId: string) {
  return {
    inline_keyboard: [
      [
        { text: 'только что', callback_data: `s:${actId}:0` },
        { text: '15 мин назад', callback_data: `s:${actId}:15` },
      ],
      [
        { text: '30 мин назад', callback_data: `s:${actId}:30` },
        { text: '1 ч назад', callback_data: `s:${actId}:60` },
      ],
      [
        { text: '1.5 ч назад', callback_data: `s:${actId}:90` },
        { text: '2 ч назад', callback_data: `s:${actId}:120` },
      ],
      [{ text: '⌨️ ввести точное время', callback_data: `s:${actId}:custom` }],
    ],
  }
}

export function activityKeyboard(focus: string) {
  const acts = ACTS_BY_FOCUS[focus] || []
  const rows: { text: string; callback_data: string }[][] = []
  for (let i = 0; i < acts.length; i += 2) {
    rows.push(acts.slice(i, i + 2).map((a) => ({ text: a.label, callback_data: `a:${a.id}` })))
  }
  rows.push([{ text: '← назад', callback_data: 'back' }])
  return { inline_keyboard: rows }
}
