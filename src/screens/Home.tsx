import { useEffect, useState } from 'react'
import s from './Home.module.css'
import { FOCUSES, ACTIVITIES } from '../activities'
import { getTodayStats, startActivity, type DayStats, type ActivityBlock } from '../lib/data'
import { ActivityPicker } from '../components/ActivityPicker'
import { EditBlock } from '../components/EditBlock'
import { TimelineEditor } from '../components/TimelineEditor'

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

      {blocks.length > 0 && (
        <div className={s.tlCard}>
          <div className={s.tlHead}>
            <div className={s.tlTitle}>лента дня</div>
            {blocks.length >= 2
              ? <button className={s.tlEdit} onClick={() => setEditDay(true)}>✎ править</button>
              : <div className={s.tlHint}>08:00–20:30</div>}
          </div>
          <div className={s.tlBar}>
            {blocks.map((b) => {
              const start = new Date(b.started_at).getTime()
              const end   = b.ended_at ? new Date(b.ended_at).getTime() : Date.now()
              const mins  = Math.max(1, (end - start) / 60_000)
              return (
                <div
                  key={b.id}
                  className={s.tlSeg}
                  style={{ flex: mins, background: FOCUS_COLORS[b.focus] }}
                />
              )
            })}
          </div>
          <div className={s.tlList}>
            {blocks.map((b) => {
              const act = ACTIVITIES.find((a) => a.id === b.activity_id)
              return (
                <button key={b.id} className={s.tlRow} onClick={() => setEditBlock(b)}>
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

      {blocks.length === 0 && !loading && (
        <div className={s.emptyCard}>
          <div className={s.emptyText}>Пока нет записей на сегодня</div>
          <div className={s.emptyHint}>Нажми «выбрать» выше или ответь боту</div>
        </div>
      )}

      {picking && (
        <ActivityPicker
          onPick={async (id, focus, startedAt) => {
            await startActivity(id, focus, startedAt)
            setPicking(false)
            load()
          }}
          onClose={() => setPicking(false)}
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
