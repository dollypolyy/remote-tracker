import { useEffect, useState } from 'react'
import s from './Home.module.css'
import { FOCUSES, ACTIVITIES, type FocusKey } from '../activities'
import {
  getTodayStats, startActivity, insertBlock, FutureTimeError,
  type DayStats, type ActivityBlock,
} from '../lib/data'
import { ActivityPicker } from '../components/ActivityPicker'
import { EditBlock } from '../components/EditBlock'
import { TimelineEditor } from '../components/TimelineEditor'

type TLItem =
  | { type: 'block'; start: number; end: number; block: ActivityBlock }
  | { type: 'gap'; start: number; end: number; toNow: boolean }

// Строит ленту дня с 08:00, заполняя промежутки «пропусками»
function buildTimeline(blocks: ActivityBlock[], dayStart: number, now: number): TLItem[] {
  const items: TLItem[] = []
  let cursor = dayStart
  for (const b of blocks) {
    const bs = +new Date(b.started_at)
    const be = b.ended_at ? +new Date(b.ended_at) : now
    if (bs > cursor + 60_000) items.push({ type: 'gap', start: cursor, end: bs, toNow: false })
    items.push({ type: 'block', start: bs, end: be, block: b })
    cursor = Math.max(cursor, be)
  }
  if (cursor < now - 60_000) items.push({ type: 'gap', start: cursor, end: now, toNow: true })
  return items
}

const FOCUS_COLORS: Record<string, string> = {
  biz:   'var(--biz)',
  sport: 'var(--sport)',
  blog:  'var(--blog)',
  other: 'var(--other)',
}

function Ring({ done, goal, color }: { done: number; goal: number; color: string }) {
  const pct = goal ? Math.min(1, done / goal) : 0
  const r = 26
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="7" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeLinecap="round" strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 32 32)"
      />
    </svg>
  )
}

function elapsed(startedAt: string): string {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000)
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}ч ${m}мин` : `${h}ч`
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  })
}

export function Home() {
  const today = new Date()
  const dow  = today.toLocaleDateString('ru-RU', { weekday: 'long' })
  const day  = today.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

  const [stats, setStats] = useState<DayStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [editBlock, setEditBlock] = useState<ActivityBlock | null>(null)
  const [editDay, setEditDay] = useState(false)
  // заполнение конкретного пропуска
  const [fillGap, setFillGap] = useState<{ start: Date; end: Date; toNow: boolean } | null>(null)

  const handlePick = async (id: string, focus: FocusKey, start: Date, end?: Date) => {
    try {
      if (end) await insertBlock(id, focus, start, end)
      else await startActivity(id, focus, start)
    } catch (e) {
      if (e instanceof FutureTimeError) { alert('Нельзя ставить время вперёд 🙂'); return }
      throw e
    } finally {
      setPicking(false); setFillGap(null); load()
    }
  }

  const load = () => {
    setLoading(true)
    getTodayStats()
      .then(setStats)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000) // обновление раз в минуту
    return () => clearInterval(id)
  }, [])

  // Данные для отображения
  const focusRows = Object.values(FOCUSES).filter((f) => f.key !== 'other')
  const hoursByFocus = stats?.hoursByFocus ?? { biz: 0, sport: 0, blog: 0, other: 0 }

  const totalDone = focusRows.reduce((acc, f) => acc + Math.min(hoursByFocus[f.key], f.goalH), 0)
  const totalGoal = focusRows.reduce((acc, f) => acc + f.goalH, 0)
  const focusPct  = totalGoal > 0 ? Math.round((totalDone / totalGoal) * 100) : 0

  const currentBlock = stats?.currentBlock ?? null
  const currentAct   = currentBlock ? ACTIVITIES.find((a) => a.id === currentBlock.activity_id) : null
  const currentFocus = currentBlock ? FOCUSES[currentBlock.focus] : null

  const blocks = stats?.blocks ?? []

  const todayISO = today.toISOString().slice(0, 10)
  const dayStart = +new Date(`${todayISO}T08:00:00+03:00`)
  const now = Date.now()
  const items = buildTimeline(blocks, dayStart, now)
  const showTimeline = items.length > 0
  const totalSpan = Math.max(1, now - dayStart)

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <div>
          <div className={s.dow}>{dow}</div>
          <div className={s.date}>{day}</div>
        </div>
        <button className={s.avatar} onClick={load} title="обновить" aria-label="обновить" />
      </div>

      <div className={s.hero}>
        <div className={s.orb} aria-hidden="true" />
        <div className={s.heroLabel}>сегодня в фокусе</div>
        <div className={s.heroBig}>{loading ? '…' : `${focusPct}%`}</div>
        <div className={s.heroSub}>
          {loading ? 'загрузка...' : `${totalDone.toFixed(1)} из ${totalGoal} часов по приоритетам`}
        </div>
      </div>

      <div className={s.rings}>
        {focusRows.map((f) => {
          const done = hoursByFocus[f.key] ?? 0
          const pct  = f.goalH > 0 ? Math.min(100, Math.round((done / f.goalH) * 100)) : 0
          return (
            <div key={f.key} className={s.ringCard}>
              <div className={s.ringWrap}>
                <Ring done={done} goal={f.goalH} color={f.color} />
                <div className={s.ringVal}>{pct}%</div>
              </div>
              <div className={s.ringName}>{f.name}</div>
              <div className={s.ringGoal}>{done.toFixed(1)}/{f.goalH}ч</div>
            </div>
          )
        })}
      </div>

      <div className={s.now}>
        <div>
          <div className={s.nowLabel}>сейчас</div>
          {currentAct ? (
            <>
              <div className={s.nowAct}>{currentAct.label}</div>
              <div className={s.nowTime}>
                {elapsed(currentBlock!.started_at)} · {currentFocus?.name}
              </div>
            </>
          ) : (
            <>
              <div className={s.nowAct}>не отмечено</div>
              <div className={s.nowTime}>нажми «выбрать»</div>
            </>
          )}
        </div>
        <button className={s.nowBtn} onClick={() => setPicking(true)}>
          {currentAct ? 'сменить ›' : 'выбрать ›'}
        </button>
      </div>

      {showTimeline && (
        <div className={s.tlCard}>
          <div className={s.tlHead}>
            <div className={s.tlTitle}>лента дня</div>
            {blocks.length >= 2
              ? <button className={s.tlEdit} onClick={() => setEditDay(true)}>✎ править</button>
              : <div className={s.tlHint}>с 08:00</div>}
          </div>
          <div className={s.tlBar}>
            {items.map((it, i) => (
              <div
                key={i}
                className={it.type === 'gap' ? s.tlSegGap : s.tlSeg}
                style={{
                  flex: Math.max(1, (it.end - it.start) / 60_000),
                  background: it.type === 'block' ? FOCUS_COLORS[it.block.focus] : undefined,
                }}
              />
            ))}
          </div>
          <div className={s.tlList}>
            {items.map((it, i) => {
              if (it.type === 'gap') {
                return (
                  <button
                    key={i}
                    className={s.tlGap}
                    onClick={() => setFillGap({ start: new Date(it.start), end: new Date(it.end), toNow: it.toNow })}
                  >
                    <div className={s.tlGapDot} />
                    <div className={s.tlGapText}>заполнить пропуск</div>
                    <div className={s.tlGapDur}>{fmt(new Date(it.start).toISOString())}–{it.toNow ? 'сейчас' : fmt(new Date(it.end).toISOString())}</div>
                  </button>
                )
              }
              const b = it.block
              const act = ACTIVITIES.find((a) => a.id === b.activity_id)
              return (
                <button key={i} className={s.tlRow} onClick={() => setEditBlock(b)}>
                  <div className={s.tlDot} style={{ background: FOCUS_COLORS[b.focus] }} />
                  <div className={s.tlAct}>{act?.label ?? b.activity_id}</div>
                  <div className={s.tlDur}>
                    {fmt(b.started_at)}–{b.ended_at ? fmt(b.ended_at) : 'сейчас'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {!showTimeline && !loading && (
        <div className={s.emptyCard}>
          <div className={s.emptyText}>День ещё впереди</div>
          <div className={s.emptyHint}>Нажми «выбрать» выше или ответь боту</div>
        </div>
      )}

      {picking && (
        <ActivityPicker
          onPick={handlePick}
          onClose={() => setPicking(false)}
        />
      )}

      {fillGap && (
        <ActivityPicker
          title="что было в это время?"
          fixedStart={fillGap.start}
          fixedEnd={fillGap.toNow ? undefined : fillGap.end}
          onPick={handlePick}
          onClose={() => setFillGap(null)}
        />
      )}

      {editBlock && (
        <EditBlock
          block={editBlock}
          onDone={() => { setEditBlock(null); load() }}
          onClose={() => setEditBlock(null)}
        />
      )}

      {editDay && blocks.length >= 2 && (
        <TimelineEditor
          blocks={blocks}
          onSaved={() => { setEditDay(false); load() }}
          onClose={() => setEditDay(false)}
        />
      )}
    </div>
  )
}
