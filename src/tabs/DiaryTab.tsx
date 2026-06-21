import { useState, useEffect } from 'react'
import { useCollection } from '../hooks/useStorage'
import { generateId, nowIso, todayStr } from '../storage'
import type { DiaryEntry, Energy } from '../types'
import { VoiceButton } from '../components/VoiceButton'
import { useVoice } from '../hooks/useVoice'
import cardStyles from '../components/Card.module.css'
import f from '../components/form.module.css'
import styles from './Tab.module.css'

const CHECKLIST_ITEMS = [
  '10–15 новых строк на карте',
  'топ-3 строки дня отмечены',
  'шортлист обновлён',
  'записана энергия дня',
  '+2–3 имени в «Люди»',
]

interface Props {
  totalWays: number
  todayWays: number
  shortlist: number
  activePeople: number
  activeHypotheses: number
}

export function DiaryTab({ totalWays, todayWays, shortlist, activePeople, activeHypotheses }: Props) {
  const { items, upsert } = useCollection('diary')
  const today = todayStr()

  const existing = items.find((d) => d.date === today)
  const [text, setText] = useState(existing?.text ?? '')
  const [energy, setEnergy] = useState<Energy | ''>(existing?.energy ?? '')
  const [checklist, setChecklist] = useState<Record<string, boolean>>(existing?.checklist ?? {})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const e = items.find((d) => d.date === today)
    if (e) {
      setText(e.text)
      setEnergy(e.energy)
      setChecklist(e.checklist ?? {})
    }
  }, [items, today])

  const { isListening, isSupported, toggle } = useVoice({
    onResult: (t) => setText((prev) => prev + t + ' '),
  })

  function save() {
    const now = nowIso()
    upsert({
      id: existing?.id ?? generateId(),
      date: today,
      text,
      energy,
      checklist,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  function toggleCheck(key: string) {
    const next = { ...checklist, [key]: !checklist[key] }
    setChecklist(next)
    const now = nowIso()
    upsert({
      id: existing?.id ?? generateId(),
      date: today,
      text,
      energy,
      checklist: next,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
  }

  const pastEntries = [...items]
    .filter((d) => d.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14)

  return (
    <div>
      {/* Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{totalWays}</div>
          <div className={styles.statLabel}>способов на карте</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{todayWays}</div>
          <div className={styles.statLabel}>добавлено сегодня</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{shortlist}</div>
          <div className={styles.statLabel}>в шортлисте ↑</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{activePeople}</div>
          <div className={styles.statLabel}>людей в работе</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statNum}>{activeHypotheses}</div>
          <div className={styles.statLabel}>активных гипотез</div>
        </div>
      </div>

      {/* Checklist */}
      <div className={styles.checklist}>
        <div className={styles.sectionTitle} style={{ marginBottom: 10 }}>ритуал дня</div>
        {CHECKLIST_ITEMS.map((label) => (
          <label key={label} className={styles.checkItem}>
            <input
              type="checkbox"
              className={styles.checkBox}
              checked={!!checklist[label]}
              onChange={() => toggleCheck(label)}
            />
            <span className={`${styles.checkLabel} ${checklist[label] ? styles.done : ''}`}>{label}</span>
          </label>
        ))}
      </div>

      {/* Today's entry */}
      <div className={styles.sectionTitle}>итог сегодня — {today}</div>

      {!isSupported && (
        <div className={styles.voiceHint}>
          голосовой ввод работает в Chrome / Яндекс.Браузере. запусти приложение через <code>npm run dev</code>, а не открытием файла напрямую.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>энергия дня</div>
        {(['↑', '↓', '?'] as Energy[]).map((e) => (
          <button
            key={e}
            onClick={() => setEnergy(e)}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              border: '1.5px solid',
              borderColor: energy === e ? 'var(--pink)' : 'rgba(175,194,227,0.45)',
              background: energy === e ? 'var(--pink-light)' : 'transparent',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {e}
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: 14 }}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="как прошёл день, что узнала, что чувствуешь..."
          rows={7}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 'var(--radius)',
            border: '1.5px solid rgba(175,194,227,0.45)',
            background: '#fff',
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--text)',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 28 }}>
        {isSupported && (
          <button
            onClick={toggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 22px',
              borderRadius: 40,
              border: 'none',
              background: isListening ? 'var(--pink)' : 'var(--pink-light)',
              color: 'var(--text)',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              animation: isListening ? 'pulse 1.4s ease-in-out infinite' : 'none',
            }}
          >
            🎙 {isListening ? 'остановить' : 'наговорить'}
          </button>
        )}
        <button className={f.btnPrimary} onClick={save}>
          {saved ? 'сохранено ✓' : 'сохранить'}
        </button>
      </div>

      {/* Past entries */}
      {pastEntries.length > 0 && (
        <>
          <div className={styles.sectionTitle} style={{ marginBottom: 12 }}>прошлые записи</div>
          <div className={styles.grid}>
            {pastEntries.map((entry) => (
              <div key={entry.id} className={cardStyles.card}>
                <div className={cardStyles.cardHead}>
                  <div className={cardStyles.cardTitle} style={{ fontStyle: 'normal', fontSize: 14, fontFamily: 'var(--font-body)' }}>
                    {entry.date}
                  </div>
                  {entry.energy && (
                    <span style={{ fontSize: 18 }}>{entry.energy}</span>
                  )}
                </div>
                {entry.text && <div className={cardStyles.cardNote}>{entry.text}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,169,196,0.6); }
          50% { box-shadow: 0 0 0 10px rgba(239,169,196,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          button[style*="pulse"] { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
