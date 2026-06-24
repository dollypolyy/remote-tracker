import { useEffect, useState } from 'react'
import s from './Stats.module.css'
import { FOCUSES } from '../activities'
import { getRangeStats, type DayAgg } from '../lib/data'

const MOODS = ['', '😣', '😕', '😐', '🙂', '😄']
const FOCUS_COLORS: Record<string, string> = {
  biz: 'var(--biz)', sport: 'var(--sport)', blog: 'var(--blog)', other: 'var(--other)',
}
const FOCUS_TARGET = 8.5 // 6 + 0.5 + 2

function dowLetter(date: string): string {
  return new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short' })[0]
}

export function Stats({ onBack }: { onBack: () => void }) {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<DayAgg[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getRangeStats(days).then(setData).finally(() => setLoading(false))
  }, [days])

  const rows = data ?? []
  const n = rows.length || 1
  const sumFocus = rows.reduce((a, d) => a + d.focusH, 0)
  const sumOther = rows.reduce((a, d) => a + d.otherH, 0)
  const avgFocus = sumFocus / n
  const daysMet = rows.filter((d) => d.focusH >= FOCUS_TARGET).length
  const maxBar = Math.max(FOCUS_TARGET, ...rows.map((d) => d.focusH + d.otherH), 1)

  const avgByFocus = (['biz', 'sport', 'blog'] as const).map((k) => ({
    key: k,
    name: FOCUSES[k].name,
    avg: rows.reduce((a, d) => a + d.hoursByFocus[k], 0) / n,
    goal: FOCUSES[k].goalH,
  }))

  const fmt = (n: number) => n.toFixed(1).replace('.', ',')

  const moods = rows.filter((d) => d.mood != null)
  const avgMood = moods.length ? moods.reduce((a, d) => a + (d.mood || 0), 0) / moods.length : null

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>‹ назад</button>
        <div className={s.title}>статистика</div>
        <div className={s.tabs}>
          <button className={`${s.tab} ${days === 7 ? s.tabOn : ''}`} onClick={() => setDays(7)}>неделя</button>
          <button className={`${s.tab} ${days === 30 ? s.tabOn : ''}`} onClick={() => setDays(30)}>месяц</button>
        </div>
      </div>

      {loading ? (
        <div className={s.loading}>загрузка…</div>
      ) : (
        <>
          {/* сводка */}
          <div className={s.cards}>
            <div className={s.card}>
              <div className={s.cardBig}>{fmt(avgFocus)} ч</div>
              <div className={s.cardLabel}>в фокусе / день</div>
            </div>
            <div className={s.card}>
              <div className={s.cardBig}>{daysMet}<span className={s.cardSm}>/{n}</span></div>
              <div className={s.cardLabel}>дней с нормой ({FOCUS_TARGET}ч)</div>
            </div>
          </div>

          {/* столбики по дням */}
          <div className={s.block}>
            <div className={s.blockTitle}>фокус по дням</div>
            <div className={s.bars}>
              {rows.map((d) => {
                const total = d.focusH + d.otherH
                return (
                  <div key={d.date} className={s.barCol}>
                    <div className={s.barTrack}>
                      <div className={s.barStack} style={{ height: `${(total / maxBar) * 100}%` }}>
                        {(['biz', 'sport', 'blog', 'other'] as const).map((k) => (
                          d.hoursByFocus[k] > 0 && (
                            <div key={k} style={{
                              flex: d.hoursByFocus[k],
                              background: FOCUS_COLORS[k],
                            }} />
                          )
                        ))}
                      </div>
                    </div>
                    {days === 7 && <div className={s.barLbl}>{dowLetter(d.date)}</div>}
                  </div>
                )
              })}
            </div>
          </div>

          {/* средние по фокусам */}
          <div className={s.block}>
            <div className={s.blockTitle}>среднее по фокусам</div>
            {avgByFocus.map((f) => (
              <div key={f.key} className={s.fRow}>
                <div className={s.fTop}>
                  <span className={s.fName}>{f.name}</span>
                  <span className={s.fVal}>{fmt(f.avg)} ч <span className={s.fGoal}>/ {f.goal} ч</span></span>
                </div>
                <div className={s.fTrack}>
                  <div className={s.fFill} style={{
                    width: `${Math.min(100, (f.avg / f.goal) * 100)}%`,
                    background: FOCUS_COLORS[f.key],
                  }} />
                </div>
              </div>
            ))}
            <div className={s.otherLine}>вне фокуса в среднем {fmt(sumOther / n)} ч / день</div>
          </div>

          {/* настроение */}
          <div className={s.block}>
            <div className={s.blockTitle}>
              настроение {avgMood != null && <span className={s.moodAvg}>{MOODS[Math.round(avgMood)]}</span>}
            </div>
            <div className={s.moodRow}>
              {rows.map((d) => (
                <div key={d.date} className={s.moodCell}>
                  <div className={s.moodEmoji}>{d.mood ? MOODS[d.mood] : '·'}</div>
                  {days === 7 && <div className={s.moodLbl}>{dowLetter(d.date)}</div>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <div className={s.pad} />
    </div>
  )
}
