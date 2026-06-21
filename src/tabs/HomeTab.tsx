import { useState } from 'react'
import type { TabId } from '../components/Layout'
import { MapTab } from './MapTab'
import { PeopleTab } from './PeopleTab'
import { HypothesesTab } from './HypothesesTab'
import styles from './HomeTab.module.css'

interface Props {
  totalWays: number
  todayWays: number
  shortlist: number
  activePeople: number
  activeHypotheses: number
  onNavigate: (tab: TabId) => void
  onDataChange: () => void
}

function greeting() {
  const h = new Date().getHours()
  if (h < 6) return { text: 'доброй ночи', emoji: '🌙' }
  if (h < 12) return { text: 'доброе утро', emoji: '☀️' }
  if (h < 18) return { text: 'добрый день', emoji: '🌤' }
  return { text: 'добрый вечер', emoji: '🌙' }
}

function todayLabel() {
  return new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

type QuickPanel = 'ways' | 'people' | 'hypotheses' | null

const SECTIONS = [
  {
    id: 'ways' as const,
    icon: '🗺',
    title: 'способы заработка',
    color: '#F3C2D4',
    tab: 'map' as TabId,
  },
  {
    id: 'people' as const,
    icon: '👥',
    title: 'люди',
    color: '#B9CBE8',
    tab: 'people' as TabId,
  },
  {
    id: 'hypotheses' as const,
    icon: '💡',
    title: 'гипотезы',
    color: '#F3C2D4',
    tab: 'hypotheses' as TabId,
  },
  {
    id: 'diary' as const,
    icon: '✨',
    title: 'итог дня',
    color: '#B9CBE8',
    tab: 'diary' as TabId,
  },
]

export function HomeTab({ totalWays, todayWays, shortlist, activePeople, activeHypotheses, onNavigate, onDataChange }: Props) {
  const g = greeting()
  const [quickPanel, setQuickPanel] = useState<QuickPanel>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const counts: Record<string, number> = {
    ways: totalWays,
    people: activePeople,
    hypotheses: activeHypotheses,
    diary: 0,
  }

  function handleAdd(id: string) {
    if (id === 'diary') {
      onNavigate('diary')
      return
    }
    setQuickPanel(id as QuickPanel)
  }

  return (
    <div className={styles.root}>
      {/* Greeting */}
      <div className={styles.greetBlock}>
        <div className={styles.greetEmoji}>{g.emoji}</div>
        <div>
          <div className={styles.greetText}>{g.text}, Даша</div>
          <div className={styles.greetDate}>{todayLabel()}</div>
        </div>
      </div>

      {/* Quick stats row */}
      <div className={styles.statsRow}>
        <div className={styles.statPill}>
          <span className={styles.statN}>{totalWays}</span>
          <span className={styles.statL}>способов</span>
        </div>
        <div className={styles.statPill}>
          <span className={styles.statN}>{todayWays}</span>
          <span className={styles.statL}>сегодня</span>
        </div>
        <div className={styles.statPill}>
          <span className={styles.statN}>{shortlist}</span>
          <span className={styles.statL}>в шортлисте</span>
        </div>
      </div>

      {/* Section cards */}
      <div className={styles.grid}>
        {SECTIONS.map((s) => {
          const isHovered = hoveredId === s.id
          return (
            <div
              key={s.id}
              className={`${styles.card} ${isHovered ? styles.cardHovered : ''}`}
              style={{ '--card-accent': s.color } as React.CSSProperties}
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(s.id)}
              onBlur={() => setHoveredId(null)}
              tabIndex={0}
            >
              <div className={styles.cardTop}>
                <span className={styles.cardIcon}>{s.icon}</span>
                <div>
                  <div className={styles.cardTitle}>{s.title}</div>
                  {s.id !== 'diary' && (
                    <div className={styles.cardCount}>{counts[s.id]} записей</div>
                  )}
                </div>
              </div>

              <div className={`${styles.cardActions} ${isHovered ? styles.actionsVisible : ''}`}>
                <button
                  className={styles.actionBtn}
                  onClick={() => handleAdd(s.id)}
                  onFocus={(e) => e.stopPropagation()}
                >
                  + добавить
                </button>
                <button
                  className={`${styles.actionBtn} ${styles.actionBtnOutline}`}
                  onClick={() => onNavigate(s.tab)}
                  onFocus={(e) => e.stopPropagation()}
                >
                  открыть всё →
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Daily nudge */}
      <div className={styles.nudge}>
        <div className={styles.nudgeTitle}>сегодня стоит</div>
        <div className={styles.nudgeItems}>
          <span className={styles.nudgeItem}>добавить 10–15 способов</span>
          <span className={styles.nudgeDot}>·</span>
          <span className={styles.nudgeItem}>написать 2–3 людям</span>
          <span className={styles.nudgeDot}>·</span>
          <span className={styles.nudgeItem}>записать гипотезу</span>
        </div>
      </div>

      {/* Quick-add panels (inline, no modal) */}
      {quickPanel === 'ways' && (
        <div className={styles.quickPanel}>
          <div className={styles.quickPanelHead}>
            <span>быстро добавить способ</span>
            <button className={styles.quickClose} onClick={() => { setQuickPanel(null); onDataChange() }}>✕</button>
          </div>
          <MapTab hideFab />
        </div>
      )}
      {quickPanel === 'people' && (
        <div className={styles.quickPanel}>
          <div className={styles.quickPanelHead}>
            <span>быстро добавить человека</span>
            <button className={styles.quickClose} onClick={() => { setQuickPanel(null); onDataChange() }}>✕</button>
          </div>
          <PeopleTab hideFab />
        </div>
      )}
      {quickPanel === 'hypotheses' && (
        <div className={styles.quickPanel}>
          <div className={styles.quickPanelHead}>
            <span>быстро добавить гипотезу</span>
            <button className={styles.quickClose} onClick={() => { setQuickPanel(null); onDataChange() }}>✕</button>
          </div>
          <HypothesesTab hideFab />
        </div>
      )}
    </div>
  )
}
