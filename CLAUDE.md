# remote-tracker — контроллер времени + личный дневник

Личное приложение Даши. Цель: трекать вложение времени в 3 приоритета и вести голосовой дневник.
Бот каждые 30 мин (08:00–20:30 МСК) спрашивает «что делаешь?», ответы складываются в ленту дня.

## Стек
- Vite + React 18 + TypeScript, CSS Modules
- Supabase (БД, async storage-адаптер) — `src/lib/supabase.ts`, `src/storage.ts`
- Telegram Mini App (WebApp SDK подключён в `index.html`)
- Деплой: Vercel (автодеплой с push в `main`), репо `dollypolyy/remote-tracker`
- Бот: `@remote_tracker_dp_bot`, открывается как `t.me/remote_tracker_dp_bot/tracker`

## Язык
**Весь интерфейс и все названия активностей — на русском, единый стиль** (короткие ярлычки в нижнем регистре). Никакого `research`/`building` — только `поиск`/`делаю продукт`. Источник истины по активностям — `src/activities.ts`, нигде не дублировать названия.

## 3 фокуса + минимумы (см. `src/activities.ts`)
- 🟣 **бизнес** (AI) — минимум 6 ч/день — цвет `--biz`
- 🟢 **спорт/здоровье** — минимум 30 мин/день — цвет `--sport`
- 🔵 **блог/контент** — минимум 2 ч/день — цвет `--blog`
- ⚪ **прочее** — без минимума — цвет `--other`

## Дизайн (glassmorphism, розовый)
Токены — в `src/index.css` (`:root`). НЕ хардкодить цвета в компонентах, только `var(--...)`.
- фон: розовый градиент `--rose-1 → --rose-2 → --rose-3`, глянцевый шар-орб
- карточки: матовое стекло (`--glass`, `backdrop-filter: blur`) или белые
- акцент почти-чёрный `--ink` (#211A1E), мягкий текст `--ink-soft`
- крупная жирная типографика, скругления `--radius` / `--radius-sm`
- ширина контента max 440px (мобайл-first)

## Структура
- `src/activities.ts` — справочник фокусов и активностей (единственный источник)
- `src/screens/Home.tsx` — главный экран: герой-карточка %, кольца фокусов, «сейчас», лента дня
- `src/storage.ts` — async StorageAdapter (Supabase), интерфейс не менять
- `src/hooks/useStorage.ts` — async useCollection
- `src/hooks/useVoice.ts` — Web Speech API (ru-RU) для голосового дневника
- `src/tabs/`, `src/components/`, `src/types.ts` — наследие старой версии, постепенно убираем

## Правила
- tsconfig: `noUnusedLocals: false` (Vercel-сборка падала на неиспользуемых импортах)
- SVG-атрибуты в React — camelCase (`strokeLinecap`, не `strokelinecap`)
- секреты (.env, токены) НИКОГДА не коммитить и не печатать в чат
- проверка сборки перед пушем: `npm run build`
