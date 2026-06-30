import { useEffect, useState } from 'react'
import s from './Home.module.css'
import { FOCUSES, ACTIVITIES, FOCUS_GOAL_H, SPORT_GOAL_H, type FocusKey } from '../activities'
import {
  getTodayStats, getWeekStats, startActivity, insertBlock, FutureTimeError,
  type DayStats, type ActivityBlock, type WeekStats,
} from '../lib/data'
import { ActivityPicker } from '../components/ActivityPicker'
import { EditBlock } from '../components/EditBlock'
import { TimelineEditor } from '../components/TimelineEditor'
import { FocusDetail } from '../components/FocusDetail'

type TLItem =
  | { type: 'block'; start: number; end: number; block: ActivityBlock }
  | { type: 'gap'; start: number; end: number; toNow: boolean }

const fmtH = (n: number) => {
  const r = Math.round(n * 10) / 10
  return r % 1 === 0 ? String(r) : r.toFixed(1).replace('.', ',')
}

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
  biz: 'var(--biz)', sport: 'var(--sport)', blog: 'var(--blog)', other: 'var(--other)',
}

const DOW_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']

function FocusRing({ done, goal, bizH, blogH }: { done: number; goal: number; bizH: number; blogH: number }) {
  const pct = goal ? Math.min(1, done / goal) : 0
  const r = 48
  const stroke = 10
  const size = (r + stroke) * 2 + 4
  const c = 2 * Math.PI * r
  const totalFocus = bizH + blogH
  const bizPct = totalFocus > 0 ? bizH / totalFocus : 1

  return (
    <div className={s.focusRingWrap}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={stroke} />
        {blogH > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--blog)" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {pct > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--biz)" strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * pct * bizPct} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className={s.focusRingInner}>
        <div className={s.focusRingPct}>{Math.round(pct * 100)}%</div>
        <div className={s.focusRingH}>{fmtH(done)} / {goal}ч</div>
      </div>
    </div>
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

  const [stats, setStats]         = useState<DayStats | null>(null)
  const [weekStats, setWeekStats] = useState<WeekStats | null>(null)
  const [loading, setLoading]     = useState(true)
  const [picking, setPicking]     = useState(false)
  const [editBlock, setEditBlock] = useState<ActivityBlock | null>(null)
  const [editDay, setEditDay]     = useState(false)
  const [focusDetail, setFocusDetail] = useState<FocusKey | null>(null)
  const [showAllTl, setShowAllTl] = useState(false)
  const [fillGap, setFillGap]     = useState<{ start: Date; end: Date; toNow: boolean } | null>(null)

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
    Promise.all([getTodayStats(), getWeekStats()])
      .then(([day, week]) => { setStats(day); setWeekStats(week) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  const hoursByFocus = stats?.hoursByFocus ?? { biz: 0, sport: 0, blog: 0, other: 0 }
  const bizH   = hoursByFocus.biz
  const blogH  = hoursByFocus.blog
  const sportH = hoursByFocus.sport
  const focusH = bizH + blogH
  const sportDone = sportH >= SPORT_GOAL_H

  const currentBlock = stats?.currentBlock ?? null
  const currentAct   = currentBlock ? ACTIVITIES.find((a) => a.id === currentBlock.activity_id) : null
  const currentFocus = currentBlock ? FOCUSES[currentBlock.focus] : null

  const blocks = (stats?.blocks ?? []).filter(b => {
    const dur = (b.ended_at ? +new Date(b.ended_at) : Date.now()) - +new Date(b.started_at)
    return !b.ended_at || dur >= 60_000
  })

  const todayISO = today.toISOString().slice(0, 10)
  const dayStart = +new Date(`${todayISO}T08:00:00+03:00`)
  const now = Date.now()
  const items = buildTimeline(blocks, dayStart, now)
  const showTimeline = items.length > 0

  const weekDays    = weekStats?.days ?? []
  const weekFocusH  = weekStats?.totalFocusH ?? 0
  const weekGoalH   = weekDays.length * FOCUS_GOAL_H
  const weekDoneDays = weekDays.filter(d => d.focusH >= FOCUS_GOAL_H * 0.75).length

  const weekCoach = weekGoalH === 0 ? '' :
    weekFocusH / weekGoalH >= 0.8 ? '🔥 отличный темп — так держать' :
    weekFocusH / weekGoalH >= 0.5 ? '📈 хороший темп, поднажми' :
    '⚡ поднажми — фокус пока низкий'

  return (
    <div className={s.screen}>
      <div className={s.header}>
        <div>
          <div className={s.dow}>{dow}</div>
          <div className={s.date}>{day}</div>
        </div>
        <button className={s.avatar} onClick={load} title="обновить" aria-label="обновить" />
      </div>

      {/* Карточка фокуса — сегодня */}
      <div className={s.focusCard}>
        <div className={s.focusOrb} aria-hidden="true" />
        <div className={s.focusLabel}>фокус сегодня</div>
        <div className={s.focusTop}>
          <FocusRing done={focusH} goal={FOCUS_GOAL_H} bizH={bizH} blogH={blogH} />
          <div className={s.focusStats}>
            <div className={s.focusStat}>
              <span className={s.focusStatDot} style={{ background: 'var(--biz)' }} />
              <span className={s.focusStatLabel}>бизнес</span>
              <span className={s.focusStatVal}>{fmtH(bizH)} ч</span>
            </div>
            <div className={s.focusStat}>
              <span className={s.focusStatDot} style={{ background: 'var(--blog)' }} />
              <span className={s.focusStatLabel}>блог</span>
              <span className={s.focusStatVal}>{fmtH(blogH)} ч</span>
            </div>
            <div className={`${s.focusStat} ${sportDone ? s.focusStatSport : ''}`}>
              <span className={s.focusStatIcon}>{sportDone ? '✅' : '▫️'}</span>
              <span className={s.focusStatLabel}>спорт</span>
              <span className={s.focusStatVal}>{fmtH(sportH)}/{fmtH(SPORT_GOAL_H)} ч</span>
            </div>
          </div>
        </div>
      </div>

      {/* Карточка недели */}
      {weekDays.length > 0 && (() => {
        const totalBiz   = weekStats?.totalBizH ?? 0
        const totalBlog  = weekStats?.totalBlogH ?? 0
        const totalSport = weekStats?.totalSportH ?? 0
        const catMax = Math.max(totalBiz, totalBlog, totalSport, 1)
        const maxDayH = Math.max(...weekDays.map(d => d.focusH), FOCUS_GOAL_H, 1)
        return (
          <div className={s.weekCard}>
            <div className={s.weekHead}>
              <span className={s.weekTitle}>эта неделя</span>
              <span className={s.weekTotal}>{weekDoneDays}/{weekDays.length} дн</span>
            </div>

            {/* Категорийные бары */}
            <div className={s.weekCats}>
              {[
                { label: '💼 бизнес', color: 'var(--biz)',   val: totalBiz },
                { label: '🎬 блог',   color: 'var(--blog)',  val: totalBlog },
                { label: '🏃 спорт',  color: 'var(--sport)', val: totalSport },
              ].map(({ label, color, val }) => (
                <div key={label} className={s.weekCatRow}>
                  <span className={s.weekCatLabel}>{label}</span>
                  <div className={s.weekCatBarWrap}>
                    <div
                      className={s.weekCatBar}
                      style={{ width: `${Math.round(val / catMax * 100)}%`, background: color }}
                    />
                  </div>
                  <span className={s.weekCatVal}>{fmtH(val)} ч</span>
                </div>
              ))}
            </div>

            {/* Гистограмма по дням */}
            <div className={s.weekStrip}>
              {weekDays.map(d => {
                const pct = d.focusH / maxDayH
                const isToday = d.date === todayISO
                return (
                  <div key={d.date} className={`${s.weekDay} ${isToday ? s.weekToday : ''}`}>
                    <div className={s.weekDayH}>{d.focusH > 0 ? fmtH(d.focusH) : ''}</div>
                    <div className={s.weekBarWrap}>
                      <div
                        className={s.weekBar}
                        style={{
                          height: `${Math.max(2, Math.round(pct * 100))}%`,
                          background: d.focusH >= FOCUS_GOAL_H ? 'var(--biz)' : d.focusH >= FOCUS_GOAL_H * 0.5 ? 'var(--blog)' : 'rgba(0,0,0,0.15)',
                        }}
                      />
                    </div>
                    <div
                      className={s.weekSportDot}
                      style={{
                        background: d.sportH >= SPORT_GOAL_H ? 'var(--sport)' : 'transparent',
                        borderColor: d.sportH >= SPORT_GOAL_H ? 'var(--sport)' : 'rgba(0,0,0,0.18)',
                      }}
                    />
                    <div className={s.weekDayLabel}>{DOW_SHORT[new Date(d.date + 'T12:00:00Z').getUTCDay()]}</div>
                  </div>
                )
              })}
            </div>
            {weekCoach && <div className={s.weekHint}>{weekCoach}</div>}
          </div>
        )
      })()}

      {/* Сейчас */}
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

      {/* Лента дня */}
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
            {items.length > 5 && (
              <button className={s.tlMore} onClick={() => setShowAllTl((v) => !v)}>
                {showAllTl ? 'свернуть ⌃' : `показать все (${items.length - 5} ещё) ⌄`}
              </button>
            )}
            {(showAllTl ? items : items.slice(-5)).map((it) => {
              if (it.type === 'gap') {
                return (
                  <button
                    key={`gap-${it.start}`}
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
                <button key={b.id} className={s.tlRow} onClick={() => setEditBlock(b)}>
                  <div className={s.tlDot} style={{ background: FOCUS_COLORS[b.focus] }} />
                  <div className={s.tlAct}>{act?.label ?? b.activity_id}</div>
                  <div className={s.tlDur}>
                    {fmt(b.started_at)}–{b.ended_at ? fmt(b.ended_at) : 'сейчас'}
                  </div>
                  <div className={s.tlChevron}>›</div>
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

      {picking && <ActivityPicker onPick={handlePick} onClose={() => setPicking(false)} />}

      {fillGap && (
        <ActivityPicker
          title="что было в это время?"
          fixedStart={fillGap.start}
          fixedEnd={fillGap.end}
          gapToNow={fillGap.toNow}
          onPick={handlePick}
          onClose={() => setFillGap(null)}
        />
      )}

      {editBlock && (
        <EditBlock block={editBlock} onDone={() => { setEditBlock(null); load() }} onClose={() => setEditBlock(null)} />
      )}

      {editDay && blocks.length >= 2 && (
        <TimelineEditor
          blocks={blocks}
          onSaved={() => { setEditDay(false); load() }}
          onClose={() => setEditDay(false)}
          onRequestAdd={() => { setEditDay(false); setPicking(true) }}
        />
      )}

      {focusDetail && (
        <FocusDetail focus={focusDetail} blocks={blocks} onClose={() => setFocusDetail(null)} />
      )}
    </div>
  )
}
