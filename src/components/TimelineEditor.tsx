import { useState } from 'react'
import s from './TimelineEditor.module.css'
import { ACTIVITIES, type FocusKey } from '../activities'
import { updateBlock, type ActivityBlock } from '../lib/data'
import { ActivityPicker } from './ActivityPicker'

const COLORS: Record<string, string> = {
  biz: 'var(--biz)', sport: 'var(--sport)', blog: 'var(--blog)', other: 'var(--other)',
}
const MIN_GAP = 5 * 60_000 // минимум 5 минут на блок
const H = 480              // высота полотна, px

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  })
}
const snap5 = (ms: number) => Math.round(ms / 300_000) * 300_000

interface Props {
  blocks: ActivityBlock[]
  onSaved: () => void
  onClose: () => void
  onRequestAdd: () => void
}

export function TimelineEditor({ blocks, onSaved, onClose, onRequestAdd }: Props) {
  const N = blocks.length
  const wasOpen = !blocks[N - 1].ended_at

  const initialEdges: number[] = blocks.map((b) => +new Date(b.started_at))
  initialEdges.push(blocks[N - 1].ended_at ? +new Date(blocks[N - 1].ended_at!) : Date.now())

  const [edges, setEdges] = useState<number[]>(initialEdges)
  const [acts, setActs] = useState(
    blocks.map((b) => ({ activity_id: b.activity_id, focus: b.focus as FocusKey })),
  )
  const [renameIdx, setRenameIdx] = useState<number | null>(null)
  const [drag, setDrag] = useState(false)
  const dragData = useRefObj()

  const span = edges[N] - edges[0] || 1
  const yOf = (ms: number) => ((ms - edges[0]) / span) * H

  const onDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragData.current = { i, startY: e.clientY, startVal: edges[i] }
    setDrag(true)
  }
  const onMove = (e: React.PointerEvent) => {
    const d = dragData.current
    if (!d) return
    const dyMs = ((e.clientY - d.startY) / H) * span
    let v = snap5(d.startVal + dyMs)
    v = Math.max(edges[d.i - 1] + MIN_GAP, Math.min(edges[d.i + 1] - MIN_GAP, v))
    setEdges((prev) => prev.map((e0, idx) => (idx === d.i ? v : e0)))
  }
  const onUp = () => { dragData.current = null; setDrag(false) }

  const save = async () => {
    for (let i = 0; i < N; i++) {
      const start = new Date(edges[i]).toISOString()
      const isLast = i === N - 1
      const end = isLast && wasOpen ? null : new Date(edges[i + 1]).toISOString()
      await updateBlock(blocks[i].id, {
        started_at: start,
        ended_at: end,
        activity_id: acts[i].activity_id,
        focus: acts[i].focus,
      })
    }
    onSaved()
  }

  if (renameIdx !== null) {
    return (
      <ActivityPicker
        title="заменить на"
        activityOnly
        onPick={(id, f) => {
          setActs((prev) => prev.map((a, idx) => (idx === renameIdx ? { activity_id: id, focus: f } : a)))
          setRenameIdx(null)
        }}
        onClose={() => setRenameIdx(null)}
      />
    )
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.grab} />
        <div className={s.title}>редактор дня</div>
        <div className={s.hint}>тяни кружки — меняешь время · тап по блоку — меняешь название</div>

        <div className={s.rail} style={{ height: H }}
             onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {blocks.map((b, i) => {
            const top = yOf(edges[i])
            const height = yOf(edges[i + 1]) - top
            const act = ACTIVITIES.find((a) => a.id === acts[i].activity_id)
            return (
              <button key={b.id} className={s.seg} style={{ top, height }}
                      disabled={drag} onClick={() => setRenameIdx(i)}>
                <div className={s.segBar} style={{ background: COLORS[acts[i].focus] }} />
                <div className={s.segText}>
                  <div className={s.segAct}>{act?.label ?? acts[i].activity_id} ›</div>
                  <div className={s.segDur}>
                    {hhmm(edges[i])}–{i === N - 1 && wasOpen ? 'сейчас' : hhmm(edges[i + 1])}
                  </div>
                </div>
              </button>
            )
          })}

          {edges.slice(1, N).map((_, idx) => {
            const i = idx + 1
            return (
              <div key={i} className={s.handle} style={{ top: yOf(edges[i]) }}
                   onPointerDown={onDown(i)}>
                <span className={s.handleTime}>{hhmm(edges[i])}</span>
                <span className={s.dot} />
              </div>
            )
          })}
        </div>

        <button className={s.add} onClick={onRequestAdd}>＋ добавить этап</button>
        <button className={s.save} onClick={save}>сохранить день</button>
      </div>
    </div>
  )
}

// маленький помощник: стабильный ref-объект
function useRefObj() {
  const [obj] = useState<{ current: { i: number; startY: number; startVal: number } | null }>({ current: null })
  return obj
}
