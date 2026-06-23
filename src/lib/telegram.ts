// Настройка Telegram Mini App: развернуть на весь экран, покрасить шапку/фон.
const ROSE = '#F7DEE2'

export function initTelegram() {
  const tg = (window as any).Telegram?.WebApp
  if (!tg) return
  try {
    tg.ready()
    tg.expand()
    if (tg.setHeaderColor) tg.setHeaderColor(ROSE)
    if (tg.setBackgroundColor) tg.setBackgroundColor(ROSE)
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes()
  } catch {}
}

// безопасные отступы от Telegram (вырез, шапка)
export function tgInsets() {
  const tg = (window as any).Telegram?.WebApp
  return {
    top: tg?.safeAreaInset?.top ?? 0,
    bottom: tg?.safeAreaInset?.bottom ?? 0,
  }
}
