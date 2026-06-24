import s from './ActivityPicker.module.css'
import d from './FocusDetail.module.css'
import { FOCUSES, ACTIVITIES, type FocusKey } from '../activities'
import { type ActivityBlock } from '../lib/data'

const FOCUS_ICON: Record<FocusKey, string> = {
  biz: '💼', sport: '🏃‍♀️', blog: '🎬', other: '🌿',
}
const COLORS: Record<FocusKey, string> = {
  biz: 'var(--biz)', sport: 'var(--sport)', blog: 'var(--blog)', other: 'var(--other)',
}
const fmt = (n: number) => n.toFixed(1).replace('.', ',')

interface Props {
  focus: FocusKey
  blocks: ActivityBlock[]
  onClose: () => void
}

export function FocusDetail({ focus, blocks, onClose }: Props) {
  const now = Date.now()

  // часы по каждой активности этого фокуса
  const byAct = new Map<string, number>()
  for (const b of blocks) {
    if (b.focus !== focus) continue
    const end = b.ended_at ? +new Date(b.ended_at) : now
    const h = Math.max(0, (end - +new Date(b.started_at)) / 3_600_000)
    byAct.set(b.activity_id, (byAct.get(b.activity_id) ?? 0) + h)
  }
  const rows = [...byAct.entries()].sort((a, b) => b[1] - a[1])
  const total = rows.reduce((acc, [, h]) => acc + h, 0)
  const goal = FOCUSES[focus].goalH

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.grab} />
        <div className={s.title}>{FOCUS_ICON[focus]} {FOCUSES[focus].name}</div>
        <div className={d.summary}>
          сегодня <b>{fmt(total)} ч</b>
          {goal > 0 ? ` из ${goal} ч` : ''}
        </div>

        {rows.length === 0 ? (
          <div className={d.empty}>пока ничего не отмечено</div>
        ) : (
          <div className={d.list}>
            {rows.map(([actId, h]) => {
              const label = ACTIVITIES.find((a) => a.id === actId)?.label ?? actId
              const pct = total > 0 ? (h / total) * 100 : 0
              return (
                <div key={actId} className={d.row}>
                  <div className={d.rowTop}>
                    <span className={d.rowName}>{label}</span>
                    <span className={d.rowH}>{fmt(h)} ч</span>
                  </div>
                  <div className={d.track}>
                    <div className={d.fill} style={{ width: `${pct}%`, background: COLORS[focus] }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
