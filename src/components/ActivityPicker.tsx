import { useState } from 'react'
import s from './ActivityPicker.module.css'
import { FOCUSES, byFocus, type FocusKey } from '../activities'
import { parseMskTime } from '../lib/data'

const FOCUS_ICON: Record<FocusKey, string> = {
  biz: '💼', sport: '🏃‍♀️', blog: '🎬', other: '🌿',
}

const TIME_PRESETS = [
  { label: 'только что', mins: 0 },
  { label: '15 мин назад', mins: 15 },
  { label: '30 мин назад', mins: 30 },
  { label: '1 ч назад', mins: 60 },
  { label: '1.5 ч назад', mins: 90 },
  { label: '2 ч назад', mins: 120 },
]

interface Props {
  title?: string
  // если заданы — пропускаем выбор времени и сразу заполняем этот промежуток
  fixedStart?: Date
  fixedEnd?: Date
  onPick: (activityId: string, focus: FocusKey, startedAt: Date, endAt?: Date) => void
  onClose: () => void
}

export function ActivityPicker({ title = 'что делаешь?', fixedStart, fixedEnd, onPick, onClose }: Props) {
  const [step, setStep] = useState<'focus' | 'activity' | 'time'>('focus')
  const [focus, setFocus] = useState<FocusKey | null>(null)
  const [actId, setActId] = useState<string | null>(null)
  const [customTime, setCustomTime] = useState('')
  const [error, setError] = useState('')

  const pickActivity = (id: string, f: FocusKey) => {
    if (fixedStart) { onPick(id, f, fixedStart, fixedEnd); return }
    setActId(id); setFocus(f); setStep('time')
  }

  const confirm = (startedAt: Date) => {
    if (startedAt.getTime() > Date.now() + 60_000) { setError('Нельзя ставить время вперёд'); return }
    if (focus && actId) onPick(actId, focus, startedAt)
  }

  const onCustom = () => {
    const d = parseMskTime(customTime)
    if (!d) { setError('Напиши время как 14:30'); return }
    confirm(d)
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.grab} />

        {step === 'focus' && (
          <>
            <div className={s.title}>{title}</div>
            <div className={s.focusGrid}>
              {Object.values(FOCUSES).map((f) => (
                <button
                  key={f.key}
                  className={s.focusBtn}
                  style={{ borderColor: f.color }}
                  onClick={() => { setFocus(f.key); setActId(null); setStep('activity') }}
                >
                  <span className={s.focusIcon}>{FOCUS_ICON[f.key]}</span>
                  <span>{f.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'activity' && focus && (
          <>
            <div className={s.title}>
              <button className={s.back} onClick={() => setStep('focus')}>‹</button>
              {FOCUS_ICON[focus]} {FOCUSES[focus].name}
            </div>
            <div className={s.actList}>
              {byFocus(focus).map((a) => (
                <button
                  key={a.id}
                  className={s.actBtn}
                  onClick={() => pickActivity(a.id, focus)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'time' && (
          <>
            <div className={s.title}>
              <button className={s.back} onClick={() => setStep('activity')}>‹</button>
              когда началось?
            </div>
            <div className={s.timeGrid}>
              {TIME_PRESETS.map((t) => (
                <button
                  key={t.mins}
                  className={s.timeBtn}
                  onClick={() => confirm(new Date(Date.now() - t.mins * 60_000))}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className={s.customRow}>
              <input
                className={s.timeInput}
                value={customTime}
                onChange={(e) => { setCustomTime(e.target.value); setError('') }}
                placeholder="14:30"
                inputMode="numeric"
              />
              <button className={s.timeOk} onClick={onCustom}>задать</button>
            </div>
            {error && <div className={s.error}>{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
