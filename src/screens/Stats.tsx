import { useEffect, useState } from 'react'
import s from './Stats.module.css'
import { FOCUSES } from '../activities'
import { getRangeStats, type DayAgg } from '../lib/data'

const MOODS = ['', '😣', '😕', '😐', '🙂', '😄']
const FOCUS_COLORS: Record<string, string> = {
  biz: 'var(--biz)', sport: 'var(--sport)', blog: 'var(--blog)', other: 'var(--other)',
}
const FOCUS_TARGET = 8.5

type Period = 'week' | 'month' | 'custom'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function shiftISO(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
function fmt(n: number) { return n.toFixed(1).replace('.', ',') }
function dowLetter(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short' }).slice(0, 2)
}
function dayNum(date: string) {
  return new Date(date + 'T12:00:00').getDate().toString()
}

interface Insight { icon: string; text: string; type: 'good' | 'warn' | 'info' }

function computeInsights(rows: DayAgg[]): Insight[] {
  const active = rows.filter(r => r.focusH + r.otherH > 0)
  if (active.length === 0) return []
  const n = active.length
  const insights: Insight[] = []

  const avgBiz   = active.reduce((a, d) => a + d.hoursByFocus.biz, 0) / n
  const avgSport = active.reduce((a, d) => a + d.hoursByFocus.sport, 0) / n
  const avgBlog  = active.reduce((a, d) => a + d.hoursByFocus.blog, 0) / n

  const foci = [
    { name: 'бизнес', avg: avgBiz,   goal: 6,   key: 'biz' },
    { name: 'спорт',  avg: avgSport, goal: 0.5, key: 'sport' },
    { name: 'блог',   avg: avgBlog,  goal: 2,   key: 'blog' },
  ]
  const byRatio = [...foci].sort((a, b) => a.avg / a.goal - b.avg / b.goal)

  // самый отстающий
  const weak = byRatio[0]
  if (weak.avg / weak.goal < 0.7) {
    insights.push({ icon: '⚠️', text: `${weak.name} отстаёт — в среднем ${fmt(weak.avg)} ч из ${weak.goal} ч`, type: 'warn' })
  }

  // лидер периода
  const lead = byRatio[byRatio.length - 1]
  if (lead.avg / lead.goal >= 1) {
    insights.push({ icon: '✅', text: `${lead.name} в норме — ${fmt(lead.avg)} ч / день`, type: 'good' })
  }

  // текущая серия дней в норме (с конца)
  let streak = 0
  for (const d of [...rows].reverse()) {
    if (d.focusH >= FOCUS_TARGET) streak++
    else break
  }
  if (streak >= 2) insights.push({ icon: '🔥', text: `${streak} дня подряд в норме — держи темп`, type: 'good' })

  // тренд: последние 3 дня vs. весь период
  if (active.length >= 5) {
    const last3 = rows.slice(-3).filter(d => d.focusH + d.otherH > 0)
    if (last3.length >= 2) {
      const recentAvg = last3.reduce((a, d) => a + d.focusH, 0) / last3.length
      const baseAvg   = active.reduce((a, d) => a + d.focusH, 0) / n
      if (recentAvg > baseAvg * 1.2) {
        insights.push({ icon: '📈', text: `последние дни сильнее среднего — +${fmt(recentAvg - baseAvg)} ч/день`, type: 'good' })
      } else if (recentAvg < baseAvg * 0.75) {
        insights.push({ icon: '📉', text: `последние дни слабее среднего — ${fmt(baseAvg - recentAvg)} ч/день теряешь`, type: 'warn' })
      }
    }
  }

  // совет на основе слабого места
  if (weak.avg / weak.goal < 0.5) {
    const tips: Record<string, string> = {
      biz:   'попробуй начинать утро с 1 ч бизнеса до всего остального',
      sport: 'даже 30 мин утром закрывают норму — поставь напоминание',
      blog:  'съёмка блоками по 1 ч эффективнее длинных сессий',
    }
    if (tips[weak.key]) {
      insights.push({ icon: '💡', text: tips[weak.key], type: 'info' })
    }
  }

  return insights
}

export function Stats({ onBack }: { onBack: () => void }) {
  const today = todayISO()
  const [period, setPeriod]       = useState<Period>('week')
  const [customStart, setStart]   = useState(shiftISO(today, -6))
  const [customEnd,   setEnd]     = useState(today)
  const [data, setData]           = useState<DayAgg[] | null>(null)
  const [loading, setLoading]     = useState(true)

  const startISO = period === 'week'  ? shiftISO(today, -6)
                 : period === 'month' ? shiftISO(today, -29)
                 : customStart
  const endISO   = period === 'custom' ? customEnd : today

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd || customStart > customEnd)) return
    setLoading(true)
    getRangeStats(startISO, endISO).then(setData).finally(() => setLoading(false))
  }, [period, startISO, endISO])

  const rows   = data ?? []
  const active = rows.filter(r => r.focusH + r.otherH > 0)
  const n      = active.length || 1
  const total  = rows.length

  const sumFocus   = rows.reduce((a, d) => a + d.focusH, 0)
  const avgFocus   = active.length ? sumFocus / n : 0
  const daysMet    = rows.filter(d => d.focusH >= FOCUS_TARGET).length
  const bestDay    = rows.reduce((best, d) => d.focusH > best ? d.focusH : best, 0)
  const maxBar     = Math.max(FOCUS_TARGET, ...rows.map(d => d.focusH + d.otherH), 1)
  const showLabels = rows.length <= 14
  const showNums   = rows.length <= 14

  const avgByFocus = (['biz', 'sport', 'blog'] as const).map(k => ({
    key: k, name: FOCUSES[k].name,
    avg: active.length ? active.reduce((a, d) => a + d.hoursByFocus[k], 0) / n : 0,
    goal: k === 'sport' ? 0.5 : k === 'biz' ? 6 : 2,
  }))

  const moods    = rows.filter(d => d.mood != null)
  const avgMood  = moods.length ? moods.reduce((a, d) => a + (d.mood || 0), 0) / moods.length : null
  const insights = data ? computeInsights(rows) : []

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>‹ назад</button>
        <div className={s.title}>статистика</div>
      </div>

      {/* выбор периода */}
      <div className={s.periodRow}>
        {(['week', 'month', 'custom'] as Period[]).map(p => (
          <button key={p} className={`${s.tab} ${period === p ? s.tabOn : ''}`} onClick={() => setPeriod(p)}>
            {p === 'week' ? 'неделя' : p === 'month' ? 'месяц' : 'свой'}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className={s.customRow}>
          <label className={s.dateField}>
            <span className={s.dateLbl}>с</span>
            <input type="date" className={s.dateIn} value={customStart} max={customEnd || today}
              onChange={e => setStart(e.target.value)} />
          </label>
          <span className={s.dateSep}>—</span>
          <label className={s.dateField}>
            <span className={s.dateLbl}>по</span>
            <input type="date" className={s.dateIn} value={customEnd} min={customStart} max={today}
              onChange={e => setEnd(e.target.value)} />
          </label>
        </div>
      )}

      {loading ? (
        <div className={s.loading}>загрузка…</div>
      ) : (
        <>
          {/* сводные карточки */}
          <div className={s.cards}>
            <div className={s.card}>
              <div className={s.cardBig}>{fmt(avgFocus)} ч</div>
              <div className={s.cardLabel}>в фокусе / день</div>
            </div>
            <div className={s.card}>
              <div className={s.cardBig}>{daysMet}<span className={s.cardSm}>/{total}</span></div>
              <div className={s.cardLabel}>дней в норме</div>
            </div>
            <div className={s.card}>
              <div className={s.cardBig}>{fmt(bestDay)} ч</div>
              <div className={s.cardLabel}>лучший день</div>
            </div>
          </div>

          {/* инсайты */}
          {insights.length > 0 && (
            <div className={s.block}>
              <div className={s.blockTitle}>аналитика</div>
              <div className={s.insights}>
                {insights.map((ins, i) => (
                  <div key={i} className={`${s.insight} ${s[ins.type]}`}>
                    <span className={s.insIcon}>{ins.icon}</span>
                    <span className={s.insText}>{ins.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* столбики по дням */}
          <div className={s.block}>
            <div className={s.blockTitle}>фокус по дням</div>
            <div className={s.bars}>
              {rows.map(d => {
                const total = d.focusH + d.otherH
                return (
                  <div key={d.date} className={s.barCol}>
                    {showNums && (
                      <div className={s.barNum}>
                        {d.focusH > 0 ? fmt(d.focusH) : ''}
                      </div>
                    )}
                    <div className={s.barTrack}>
                      <div className={s.barStack} style={{ height: `${(total / maxBar) * 100}%` }}>
                        {(['biz', 'sport', 'blog', 'other'] as const).map(k =>
                          d.hoursByFocus[k] > 0 && (
                            <div key={k} style={{ flex: d.hoursByFocus[k], background: FOCUS_COLORS[k] }} />
                          )
                        )}
                      </div>
                    </div>
                    {showLabels && (
                      <div className={s.barLbl}>
                        {rows.length <= 7 ? dowLetter(d.date) : dayNum(d.date)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* среднее по фокусам */}
          <div className={s.block}>
            <div className={s.blockTitle}>среднее / активный день</div>
            {avgByFocus.map(f => (
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
            <div className={s.activeLine}>
              активных дней: {active.length} из {total}
            </div>
          </div>

          {/* настроение */}
          {moods.length > 0 && (
            <div className={s.block}>
              <div className={s.blockTitle}>
                настроение {avgMood != null && <span className={s.moodAvg}>{MOODS[Math.round(avgMood)]}</span>}
              </div>
              <div className={s.moodRow}>
                {rows.map(d => (
                  <div key={d.date} className={s.moodCell}>
                    <div className={s.moodEmoji}>{d.mood ? MOODS[d.mood] : '·'}</div>
                    {showLabels && <div className={s.moodLbl}>{dowLetter(d.date)}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <div className={s.pad} />
    </div>
  )
}
