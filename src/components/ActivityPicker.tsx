import { useState } from 'react'
import s from './ActivityPicker.module.css'
import { FOCUSES, byFocus, ACTIVITIES, type FocusKey } from '../activities'
import { parseMskTime, mskHHMM } from '../lib/data'

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

// длительности для заполнения пропуска
const GAP_DURS = [15, 30, 60, 90, 120]

interface Props {
  title?: string
  // если заданы — режим заполнения пропуска [fixedStart, fixedEnd]
  fixedStart?: Date
  fixedEnd?: Date
  gapToNow?: boolean      // пропуск тянется до «сейчас»
  activityOnly?: boolean  // только выбрать активность (для замены), без вопроса о времени
  onPick: (activityId: string, focus: FocusKey, startedAt: Date, endAt?: Date) => void
  onClose: () => void
}

export function ActivityPicker({ title = 'что делаешь?', fixedStart, fixedEnd, gapToNow, activityOnly, onPick, onClose }: Props) {
  const [step, setStep] = useState<'focus' | 'activity' | 'time' | 'gapEnd'>('focus')
  const [focus, setFocus] = useState<FocusKey | null>(null)
  const [actId, setActId] = useState<string | null>(null)
  const [customTime, setCustomTime] = useState('')
  const [error, setError] = useState('')

  const isGap = !!fixedStart

  const pickActivity = (id: string, f: FocusKey) => {
    if (activityOnly) { onPick(id, f, new Date()); return }
    setActId(id); setFocus(f)
    setStep(isGap ? 'gapEnd' : 'time')
  }

  // обычный режим: «когда началось»
  const confirm = (startedAt: Date) => {
    if (startedAt.getTime() > Date.now() + 60_000) { setError('Нельзя ставить время вперёд'); return }
    if (focus && actId) onPick(actId, focus, startedAt)
  }
  const onCustom = () => {
    const d = parseMskTime(customTime)
    if (!d) { setError('Напиши время как 14:30'); return }
    confirm(d)
  }

  // режим пропуска: выбрать конец отрезка внутри [fixedStart, fixedEnd]
  const confirmGap = (end: Date) => {
    if (!fixedStart || !focus || !actId) return
    let e = end
    if (fixedEnd && e.getTime() > fixedEnd.getTime()) e = fixedEnd
    if (e.getTime() <= fixedStart.getTime()) { setError('Конец должен быть позже начала'); return }
    // если время в пределах 10 мин от «сейчас» — открытый блок (не закрывать)
    if (gapToNow && e.getTime() >= Date.now() - 10 * 60_000) onPick(actId, focus, fixedStart)
    else onPick(actId, focus, fixedStart, e)
  }
  // «продолжается сейчас» — всегда открытый блок, без проверки времени
  const confirmToNow = () => {
    if (!fixedStart || !focus || !actId) return
    onPick(actId, focus, fixedStart)
  }
  const onCustomGap = () => {
    const d = parseMskTime(customTime)
    if (!d) { setError('Напиши время как 14:30'); return }
    confirmGap(d)
  }

  const actLabel = actId ? ACTIVITIES.find((a) => a.id === actId)?.label : ''

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
                <button key={a.id} className={s.actBtn} onClick={() => pickActivity(a.id, focus)}>
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
                <button key={t.mins} className={s.timeBtn}
                        onClick={() => confirm(new Date(Date.now() - t.mins * 60_000))}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className={s.customRow}>
              <input className={s.timeInput} value={customTime} inputMode="numeric"
                     onChange={(e) => { setCustomTime(e.target.value); setError('') }} placeholder="14:30" />
              <button className={s.timeOk} onClick={onCustom}>задать</button>
            </div>
            {error && <div className={s.error}>{error}</div>}
          </>
        )}

        {step === 'gapEnd' && fixedStart && (
          <>
            <div className={s.title}>
              <button className={s.back} onClick={() => setStep('activity')}>‹</button>
              «{actLabel}» — до скольки?
            </div>
            <div className={s.gapInfo}>
              с {mskHHMM(fixedStart.toISOString())}
              {fixedEnd ? ` · можно до ${gapToNow ? 'сейчас' : mskHHMM(fixedEnd.toISOString())}` : ''}
            </div>
            <div className={s.timeGrid}>
              {GAP_DURS
                .map((d) => ({ d, end: new Date(fixedStart.getTime() + d * 60_000) }))
                .filter(({ end }) => !fixedEnd || end.getTime() <= fixedEnd.getTime() + 60_000)
                .map(({ d, end }) => (
                  <button key={d} className={s.timeBtn} onClick={() => confirmGap(end)}>
                    {d < 60 ? `${d} мин` : d % 60 === 0 ? `${d / 60} ч` : `${(d / 60).toFixed(1).replace('.', ',')} ч`}
                  </button>
                ))}
              {gapToNow && (
                <button className={s.timeBtnWide} onClick={confirmToNow}>
                  ▶ продолжается сейчас
                </button>
              )}
              {!gapToNow && fixedEnd && (
                <button className={s.timeBtnWide} onClick={() => confirmGap(fixedEnd)}>
                  до конца пропуска
                </button>
              )}
            </div>
            <div className={s.customRow}>
              <input className={s.timeInput} value={customTime} inputMode="numeric"
                     onChange={(e) => { setCustomTime(e.target.value); setError('') }} placeholder="напр. 12:30" />
              <button className={s.timeOk} onClick={onCustomGap}>задать</button>
            </div>
            {error && <div className={s.error}>{error}</div>}
          </>
        )}
      </div>
    </div>
  )
}
