import { useEffect, useRef, useState } from 'react'
import s from './Diary.module.css'
import { useVoice } from '../hooks/useVoice'
import { getDiary, saveDiary, type DiaryEntry } from '../lib/data'

const FOCUS_EMOJI: Record<string, string> = { biz: '💼', sport: '🏃‍♀️', blog: '🎬', other: '🌿' }

const MOODS = ['😣', '😕', '😐', '🙂', '😄']

interface Field {
  key: keyof DiaryEntry
  q: string
  hint: string
}

const FIELDS: Field[] = [
  { key: 'done',         q: 'что сделала сегодня?',     hint: 'главное за день' },
  { key: 'achieved',     q: 'чего достигла?',           hint: 'маленькие победы тоже' },
  { key: 'not_achieved', q: 'что не получилось?',       hint: 'без осуждения' },
  { key: 'thoughts',     q: 'мысли и уроки',            hint: 'что поняла' },
  { key: 'goals',        q: 'цели на завтра',           hint: '1–3 пункта' },
]

const empty: DiaryEntry = {
  date: '', done: '', achieved: '', not_achieved: '', thoughts: '', goals: '', mood: null,
}

export function Diary({ onBack }: { onBack: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const todayLabel = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  const [entry, setEntry] = useState<DiaryEntry>({ ...empty, date: today })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  // в какое поле сейчас идёт голос
  const [activeField, setActiveField] = useState<keyof DiaryEntry | null>(null)
  const activeRef = useRef<keyof DiaryEntry | null>(null)
  activeRef.current = activeField

  const { isListening, isSupported, toggle, stop } = useVoice({
    onResult: (text) => {
      const f = activeRef.current
      if (!f) return
      setEntry((prev) => {
        const cur = (prev[f] as string) || ''
        return { ...prev, [f]: (cur ? cur + ' ' : '') + text.trim() }
      })
    },
  })

  useEffect(() => {
    getDiary(today)
      .then((d) => { if (d) setEntry({ ...empty, ...d }) })
      .finally(() => setLoading(false))
  }, [today])

  const set = (key: keyof DiaryEntry, value: string) => {
    setEntry((p) => ({ ...p, [key]: value }))
    setSaved(false)
  }

  const startVoice = (key: keyof DiaryEntry) => {
    if (isListening && activeField === key) { stop(); setActiveField(null); return }
    if (isListening) stop()
    setActiveField(key)
    setTimeout(toggle, 60)
  }

  const onSave = async () => {
    stop(); setActiveField(null)
    await saveDiary(entry)
    setSaved(true)
  }

  if (loading) return <div className={s.screen}><div className={s.loading}>загрузка…</div></div>

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack} aria-label="назад">‹ назад</button>
        <div className={s.title}>дневник</div>
        <div className={s.date}>{todayLabel}</div>
      </div>

      <div className={s.moodCard}>
        <div className={s.moodLabel}>настроение дня</div>
        <div className={s.moods}>
          {MOODS.map((m, i) => (
            <button
              key={i}
              className={`${s.mood} ${entry.mood === i + 1 ? s.moodActive : ''}`}
              onClick={() => { setEntry((p) => ({ ...p, mood: i + 1 })); setSaved(false) }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {FIELDS.map((f) => {
        const listening = isListening && activeField === f.key
        return (
          <div key={f.key} className={`${s.fieldCard} ${listening ? s.fieldActive : ''}`}>
            <div className={s.fieldHead}>
              <div>
                <div className={s.fieldQ}>{f.q}</div>
                <div className={s.fieldHint}>{f.hint}</div>
              </div>
              {isSupported && (
                <button
                  className={`${s.micBtn} ${listening ? s.micOn : ''}`}
                  onClick={() => startVoice(f.key)}
                  aria-label="говорить"
                >
                  {listening ? '⏹' : '🎤'}
                </button>
              )}
            </div>
            <textarea
              className={s.area}
              value={(entry[f.key] as string) || ''}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={listening ? 'говори…' : 'нажми 🎤 или печатай'}
              rows={2}
            />
          </div>
        )
      })}

      {entry.reflections && entry.reflections.length > 0 && (
        <div className={s.reflectCard}>
          <div className={s.reflectTitle}>мысли из бота</div>
          {entry.reflections.map((r, i) => (
            <div key={i} className={s.reflectItem}>
              <div className={s.reflectMeta}>
                <span>{FOCUS_EMOJI[r.focus] ?? ''} {r.focus}</span>
                <span className={s.reflectTime}>{r.time}</span>
              </div>
              <div className={s.reflectText}>{r.text}</div>
            </div>
          ))}
        </div>
      )}

      <button className={s.saveBtn} onClick={onSave}>
        {saved ? '✓ сохранено' : 'сохранить дневник'}
      </button>
      <div className={s.bottomPad} />
    </div>
  )
}
