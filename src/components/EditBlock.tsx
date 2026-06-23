import { useState } from 'react'
import s from './ActivityPicker.module.css'
import e from './EditBlock.module.css'
import { ACTIVITIES } from '../activities'
import { parseMskTime, mskHHMM, updateBlock, deleteBlock, type ActivityBlock } from '../lib/data'
import { ActivityPicker } from './ActivityPicker'

interface Props {
  block: ActivityBlock
  onDone: () => void
  onClose: () => void
}

export function EditBlock({ block, onDone, onClose }: Props) {
  const [changing, setChanging] = useState(false)
  const [start, setStart] = useState(mskHHMM(block.started_at))
  const [end, setEnd] = useState(block.ended_at ? mskHHMM(block.ended_at) : '')
  const [actId, setActId] = useState(block.activity_id)
  const [focus, setFocus] = useState(block.focus)
  const [error, setError] = useState('')

  const label = ACTIVITIES.find((a) => a.id === actId)?.label ?? actId

  const save = async () => {
    const startD = parseMskTime(start)
    if (!startD) { setError('Начало: формат 14:30'); return }
    const nowMs = Date.now() + 60_000
    if (startD.getTime() > nowMs) { setError('Начало не может быть в будущем'); return }
    let endISO: string | null = null
    if (end.trim()) {
      const endD = parseMskTime(end)
      if (!endD) { setError('Конец: формат 14:30'); return }
      if (endD.getTime() > nowMs) { setError('Конец не может быть в будущем'); return }
      if (endD.getTime() <= startD.getTime()) { setError('Конец должен быть позже начала'); return }
      endISO = endD.toISOString()
    }
    await updateBlock(block.id, {
      activity_id: actId,
      focus,
      started_at: startD.toISOString(),
      ended_at: endISO,
    })
    onDone()
  }

  const remove = async () => {
    await deleteBlock(block.id)
    onDone()
  }

  if (changing) {
    return (
      <ActivityPicker
        title="заменить на"
        onPick={(id, f) => { setActId(id); setFocus(f); setChanging(false) }}
        onClose={() => setChanging(false)}
      />
    )
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(ev) => ev.stopPropagation()}>
        <div className={s.grab} />
        <div className={s.title}>править блок</div>

        <button className={e.actRow} onClick={() => setChanging(true)}>
          <span>{label}</span>
          <span className={e.change}>сменить ›</span>
        </button>

        <div className={e.times}>
          <label className={e.field}>
            <span className={e.lbl}>начало</span>
            <input className={e.inp} value={start} onChange={(ev) => { setStart(ev.target.value); setError('') }} placeholder="14:30" inputMode="numeric" />
          </label>
          <label className={e.field}>
            <span className={e.lbl}>конец</span>
            <input className={e.inp} value={end} onChange={(ev) => { setEnd(ev.target.value); setError('') }} placeholder="сейчас" inputMode="numeric" />
          </label>
        </div>

        {error && <div className={s.error}>{error}</div>}

        <button className={e.save} onClick={save}>сохранить</button>
        <button className={e.del} onClick={remove}>удалить блок</button>
      </div>
    </div>
  )
}
