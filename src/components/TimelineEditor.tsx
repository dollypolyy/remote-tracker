import { useRef, useState } from 'react'
import s from './TimelineEditor.module.css'
import { ACTIVITIES } from '../activities'
import { updateBlock, type ActivityBlock } from '../lib/data'

const COLORS: Record<string, string> = {
  biz: 'var(--biz)', sport: 'var(--sport)', blog: 'var(--blog)', other: 'var(--other)',
}
const MIN_GAP = 5 * 60_000 // минимум 5 минут на блок
const H = 520            // высота полотна, px

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
}

export function TimelineEditor({ blocks, onSaved, onClose }: Props) {
  const N = blocks.length
  const wasOpen = !blocks[N - 1].ended_at

  // edges[i] = начало блока i; edges[N] = конец последнего
  const initial: number[] = blocks.map((b) => +new Date(b.started_at))
  initial.push(blocks[N - 1].ended_at ? +new Date(blocks[N - 1].ended_at!) : Date.now())

  const [edges, setEdges] = useState<number[]>(initial)
  const railRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ i: number; startY: number; startVal: number } | null>(null)

  const span = edges[N] - edges[0] || 1
  const yOf = (ms: number) => ((ms - edges[0]) / span) * H

  const onDown = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { i, startY: e.clientY, startVal: edges[i] }
  }

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dyMs = ((e.clientY - d.startY) / H) * span
    let v = snap5(d.startVal + dyMs)
    const lo = edges[d.i - 1] + MIN_GAP
    const hi = edges[d.i + 1] - MIN_GAP
    v = Math.max(lo, Math.min(hi, v))
    setEdges((prev) => prev.map((e0, idx) => (idx === d.i ? v : e0)))
  }

  const onUp = () => { drag.current = null }

  const save = async () => {
    for (let i = 0; i < N; i++) {
      const start = new Date(edges[i]).toISOString()
      const isLast = i === N - 1
      const end = isLast && wasOpen ? null : new Date(edges[i + 1]).toISOString()
      const origEnd = blocks[i].ended_at
      const origEndISO = origEnd ? new Date(origEnd).toISOString() : null
      const changed =
        start !== new Date(blocks[i].started_at).toISOString() ||
        origEndISO !== end
      if (changed) await updateBlock(blocks[i].id, { started_at: start, ended_at: end })
    }
    onSaved()
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.grab} />
        <div className={s.title}>редактор дня</div>
        <div className={s.hint}>тяни кружки между блоками, чтобы менять время</div>

        <div className={s.rail} ref={railRef} style={{ height: H }}
             onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {/* сегменты */}
          {blocks.map((b, i) => {
            const top = yOf(edges[i])
            const height = yOf(edges[i + 1]) - top
            const act = ACTIVITIES.find((a) => a.id === b.activity_id)
            return (
              <div key={b.id} className={s.seg} style={{ top, height }}>
                <div className={s.segBar} style={{ background: COLORS[b.focus] }} />
                <div className={s.segText}>
                  <div className={s.segAct}>{act?.label ?? b.activity_id}</div>
                  <div className={s.segDur}>
                    {hhmm(edges[i])}–{i === N - 1 && wasOpen ? 'сейчас' : hhmm(edges[i + 1])}
                  </div>
                </div>
              </div>
            )
          })}

          {/* перетаскиваемые границы (внутренние) */}
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

        <button className={s.save} onClick={save}>сохранить день</button>
      </div>
    </div>
  )
}
