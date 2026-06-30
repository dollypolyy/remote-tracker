// Единый справочник активностей.
// Используется и на экране, и в боте — названия везде одинаковые, на русском.

export type FocusKey = 'biz' | 'sport' | 'blog' | 'other'

// Цели дня
export const FOCUS_GOAL_H = 8    // часов фокуса (бизнес + блог) в день
export const SPORT_GOAL_H = 0.5  // часов спорта в день (обязательно)

export interface Focus {
  key: FocusKey
  name: string        // как пишем в интерфейсе
  color: string       // CSS-переменная
}

export interface Activity {
  id: string          // стабильный код (в базе)
  label: string       // что показываем
  focus: FocusKey
}

export const FOCUSES: Record<FocusKey, Focus> = {
  biz:   { key: 'biz',   name: 'бизнес', color: 'var(--biz)'   },
  sport: { key: 'sport', name: 'спорт',  color: 'var(--sport)' },
  blog:  { key: 'blog',  name: 'блог',   color: 'var(--blog)'  },
  other: { key: 'other', name: 'прочее', color: 'var(--other)' },
}

export const ACTIVITIES: Activity[] = [
  // 🟣 бизнес
  { id: 'biz_research', label: 'поиск',          focus: 'biz' },
  { id: 'biz_plan',     label: 'планирование',   focus: 'biz' },
  { id: 'biz_learn',    label: 'обучение',       focus: 'biz' },
  { id: 'biz_build',    label: 'делаю продукт',  focus: 'biz' },
  { id: 'biz_calls',    label: 'созвоны',        focus: 'biz' },
  { id: 'biz_strategy', label: 'стратегия',      focus: 'biz' },

  // 🟢 спорт
  { id: 'sport_gym',   label: 'зал',             focus: 'sport' },
  { id: 'sport_home',  label: 'тренировка дома', focus: 'sport' },
  { id: 'sport_walk',  label: 'прогулка',        focus: 'sport' },
  { id: 'sport_run',   label: 'пробежка',        focus: 'sport' },
  { id: 'sport_dance', label: 'танцы',           focus: 'sport' },
  { id: 'sport_yoga',  label: 'йога',            focus: 'sport' },
  { id: 'sport_other', label: 'другая активность', focus: 'sport' },

  // 🔵 блог
  { id: 'blog_idea',   label: 'идея и сценарий', focus: 'blog' },
  { id: 'blog_film',   label: 'съёмка',          focus: 'blog' },
  { id: 'blog_edit',   label: 'монтаж',          focus: 'blog' },
  { id: 'blog_post',   label: 'публикация',      focus: 'blog' },

  // ⚪ прочее
  { id: 'other_cook',   label: 'готовка',  focus: 'other' },
  { id: 'other_eat',    label: 'еда',      focus: 'other' },
  { id: 'other_study',  label: 'учёба',    focus: 'other' },
  { id: 'other_chores', label: 'быт',      focus: 'other' },
  { id: 'other_rest',   label: 'отдых',    focus: 'other' },
  { id: 'other_road',   label: 'дорога',   focus: 'other' },
  { id: 'other_scroll', label: 'залипание', focus: 'other' },
  { id: 'other_personal', label: 'личное', focus: 'other' },
]

export const byId = (id: string) => ACTIVITIES.find((a) => a.id === id)
export const byFocus = (f: FocusKey) => ACTIVITIES.filter((a) => a.focus === f)
