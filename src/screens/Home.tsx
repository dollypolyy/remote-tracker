import s from './Home.module.css'

const FOCUSES = [
  { name: 'бизнес', done: 4.5, goal: 6, unit: 'ч', color: 'var(--biz)' },
  { name: 'спорт', done: 0, goal: 0.5, unit: 'ч', color: 'var(--sport)' },
  { name: 'блог', done: 1, goal: 2, unit: 'ч', color: 'var(--blog)' },
]

const TIMELINE = [
  { act: 'сон', dur: '0:00–8:00', color: '#D9C2C8', flex: 8 },
  { act: 'готовка', dur: '8:00–8:40', color: 'var(--other)', flex: 0.7 },
  { act: 'поиск', dur: '8:40–11:00', color: 'var(--biz)', flex: 2.3 },
  { act: 'блог · монтаж', dur: '11:00–12:00', color: 'var(--blog)', flex: 1 },
  { act: 'делаю продукт', dur: '12:00–14:30', color: 'var(--biz)', flex: 2.5 },
]

function Ring({ done, goal, color }: { done: number; goal: number; color: string }) {
  const pct = Math.min(1, goal ? done / goal : 0)
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="7" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 32 32)"
      />
    </svg>
  )
}

export function Home() {
  const today = new Date()
  const dow = today.toLocaleDateString('ru-RU', { weekday: 'long' })
  const day = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  const totalDone = FOCUSES.reduce((a, f) => a + Math.min(f.done, f.goal), 0)
  const totalGoal = FOCUSES.reduce((a, f) => a + f.goal, 0)
  const focusPct = Math.round((totalDone / totalGoal) * 100)

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <div>
          <div className={s.dow}>{dow}</div>
          <div className={s.date}>{day}</div>
        </div>
        <div className={s.avatar} aria-hidden="true" />
      </div>

      <div className={s.hero}>
        <div className={s.orb} aria-hidden="true" />
        <div className={s.heroLabel}>сегодня в фокусе</div>
        <div className={s.heroBig}>{focusPct}%</div>
        <div className={s.heroSub}>{totalDone.toFixed(1)} из {totalGoal} часов по приоритетам</div>
      </div>

      <div className={s.rings}>
        {FOCUSES.map((f) => (
          <div key={f.name} className={s.ringCard}>
            <div className={s.ringWrap}>
              <Ring done={f.done} goal={f.goal} color={f.color} />
              <div className={s.ringVal}>{Math.round((f.done / f.goal) * 100)}%</div>
            </div>
            <div className={s.ringName}>{f.name}</div>
            <div className={s.ringGoal}>{f.done}/{f.goal}{f.unit}</div>
          </div>
        ))}
      </div>

      <div className={s.now}>
        <div>
          <div className={s.nowLabel}>сейчас</div>
          <div className={s.nowAct}>поиск</div>
          <div className={s.nowTime}>идёт 0:30 · бизнес</div>
        </div>
        <button className={s.nowBtn}>сменить ›</button>
      </div>

      <div className={s.tlCard}>
        <div className={s.tlHead}>
          <div className={s.tlTitle}>лента дня</div>
          <div className={s.tlHint}>08:00–20:30</div>
        </div>
        <div className={s.tlBar}>
          {TIMELINE.map((t, i) => (
            <div key={i} className={s.tlSeg} style={{ flex: t.flex, background: t.color }} />
          ))}
        </div>
        <div className={s.tlList}>
          {TIMELINE.slice(1).map((t, i) => (
            <div key={i} className={s.tlRow}>
              <div className={s.tlDot} style={{ background: t.color }} />
              <div className={s.tlAct}>{t.act}</div>
              <div className={s.tlDur}>{t.dur}</div>
            </div>
          ))}
        </div>
      </div>

      <nav className={s.nav}>
        <button className={`${s.navBtn} ${s.navActive}`} aria-label="дом">⌂</button>
        <button className={s.navBtn} aria-label="дневник">✎</button>
        <button className={`${s.navBtn} ${s.navAdd}`} aria-label="добавить">+</button>
      </nav>
    </div>
  )
}
