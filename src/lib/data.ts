import { supabase } from './supabase'
import type { FocusKey } from '../activities'

export interface ActivityBlock {
  id: string
  date: string
  started_at: string
  ended_at: string | null
  activity_id: string
  focus: FocusKey
}

export interface DayStats {
  blocks: ActivityBlock[]
  hoursByFocus: Record<FocusKey, number>
  currentBlock: ActivityBlock | null
}

export async function getTodayStats(): Promise<DayStats> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('activity_blocks')
    .select('*')
    .eq('date', today)
    .order('started_at', { ascending: true })

  if (error) throw error

  const raw = (data || []) as ActivityBlock[]
  const now = new Date()

  // Нормализация: блоки не пересекаются. Каждый заканчивается там,
  // где начинается следующий. Открытым остаётся только последний.
  const normalized: ActivityBlock[] = raw.map((b, i) => {
    const isLast = i === raw.length - 1
    const nextStart = raw[i + 1] ? +new Date(raw[i + 1].started_at) : null
    let endMs: number | null = b.ended_at ? +new Date(b.ended_at) : null
    if (endMs == null && !isLast) endMs = nextStart            // закрыть «висящий» открытый блок
    if (nextStart != null && endMs != null && endMs > nextStart) endMs = nextStart // подрезать наложение
    return { ...b, ended_at: endMs != null ? new Date(endMs).toISOString() : null }
  })

  // Слияние соседних блоков с одной и той же активностью (и в базе тоже — awaited)
  const blocks: ActivityBlock[] = []
  for (const b of normalized) {
    const prev = blocks[blocks.length - 1]
    if (prev && prev.activity_id === b.activity_id) {
      prev.ended_at = b.ended_at
      await Promise.all([
        supabase.from('activity_blocks').update({ ended_at: b.ended_at }).eq('id', prev.id),
        supabase.from('activity_blocks').delete().eq('id', b.id),
      ])
    } else {
      blocks.push({ ...b })
    }
  }

  const hoursByFocus: Record<FocusKey, number> = { biz: 0, sport: 0, blog: 0, other: 0 }
  for (const block of blocks) {
    const start = new Date(block.started_at)
    const end = block.ended_at ? new Date(block.ended_at) : now
    const h = Math.max(0, (end.getTime() - start.getTime()) / 3_600_000)
    hoursByFocus[block.focus] = (hoursByFocus[block.focus] ?? 0) + h
  }

  const currentBlock = blocks.find((b) => !b.ended_at) ?? null
  return { blocks, hoursByFocus, currentBlock }
}

// ─── Запись и правка активностей (та же логика, что в боте) ──

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

// «14:30» / «1430» / «14 30» → Date сегодня по МСК
export function parseMskTime(text: string): Date | null {
  const m = text.trim().match(/^(\d{1,2})[:.\s]?(\d{2})$/)
  if (!m) return null
  const hh = +m[1], mm = +m[2]
  if (hh > 23 || mm > 59) return null
  const d = new Date(`${todayStr()}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+03:00`)
  return isNaN(d.getTime()) ? null : d
}

export function mskHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow',
  })
}

export class FutureTimeError extends Error {
  constructor() { super('Нельзя ставить время в будущем') }
}

const MIN_DURATION = 60_000 // минимум 1 минута на блок

// Подрезает существующие блоки дня так, чтобы [startMs, endMs] никого не пересекал.
// onlyOpen=true — трогать только открытые блоки (ended_at IS NULL); явно заполненные закрытые блоки не трогать.
async function trimOverlaps(today: string, startMs: number, endMs: number, exceptId?: string, onlyOpen = false) {
  const { data } = await supabase.from('activity_blocks').select('*').eq('date', today)
  for (const b of (data || []) as ActivityBlock[]) {
    if (b.id === exceptId) continue
    if (onlyOpen && b.ended_at != null) continue          // защищаем явно введённые закрытые блоки
    const bs = +new Date(b.started_at)
    const be = b.ended_at ? +new Date(b.ended_at) : Date.now()
    if (be <= startMs || bs >= endMs) continue            // не пересекаются
    if (bs >= startMs && be <= endMs) {                   // полностью внутри → удалить
      await supabase.from('activity_blocks').delete().eq('id', b.id)
    } else if (bs < startMs && be > endMs) {              // охватывает новый → разрезать
      await supabase.from('activity_blocks').update({ ended_at: new Date(startMs).toISOString() }).eq('id', b.id)
      // Открытый блок при onlyOpen=true не разрезаем: правая часть = новая активность
      if (!onlyOpen || b.ended_at != null) {
        await supabase.from('activity_blocks').insert({
          date: today, started_at: new Date(endMs).toISOString(), ended_at: b.ended_at,
          activity_id: b.activity_id, focus: b.focus,
        })
      }
    } else if (bs < startMs) {                            // пересекает слева → обрезать конец
      await supabase.from('activity_blocks').update({ ended_at: new Date(startMs).toISOString() }).eq('id', b.id)
    } else {                                              // пересекает справа → обрезать начало
      await supabase.from('activity_blocks').update({ started_at: new Date(endMs).toISOString() }).eq('id', b.id)
    }
  }
}

// Начать активность (открытый блок до «сейчас»). Время начала не может быть в будущем.
export async function startActivity(activityId: string, focus: FocusKey, startedAt: Date): Promise<void> {
  const now = Date.now()
  if (startedAt.getTime() > now + 60_000) throw new FutureTimeError()
  const today = todayStr()
  // Деdup: не создавать, если такой же блок уже был в последние 30 сек
  const { data: recent } = await supabase
    .from('activity_blocks').select('id').eq('date', today).eq('activity_id', activityId)
    .gte('started_at', new Date(startedAt.getTime() - 30_000).toISOString())
    .lte('started_at', new Date(startedAt.getTime() + 30_000).toISOString()).limit(1)
  if (recent && recent.length > 0) return
  // onlyOpen=true: не удалять явно заполненные закрытые блоки (дорога и т.п.)
  await trimOverlaps(today, startedAt.getTime(), now, undefined, true)
  const { error } = await supabase.from('activity_blocks').insert({
    date: today,
    started_at: startedAt.toISOString(),
    activity_id: activityId,
    focus,
  })
  if (error) throw error
}

// Вставить завершённый блок в конкретный промежуток (заполнение пропуска)
export async function insertBlock(activityId: string, focus: FocusKey, start: Date, end: Date): Promise<void> {
  if (start.getTime() > Date.now() + 60_000) throw new FutureTimeError()
  if (end.getTime() <= start.getTime()) throw new Error('Конец должен быть позже начала')
  if (end.getTime() - start.getTime() < MIN_DURATION) throw new Error('Минимум 1 минута')
  const today = todayStr()
  await trimOverlaps(today, start.getTime(), end.getTime())
  const { error } = await supabase.from('activity_blocks').insert({
    date: today,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    activity_id: activityId,
    focus,
  })
  if (error) throw error
}

export async function updateBlock(
  id: string,
  patch: Partial<Pick<ActivityBlock, 'activity_id' | 'focus' | 'started_at' | 'ended_at'>>,
  date?: string,
): Promise<void> {
  // если меняется время — разрулить все перекрытия с соседями
  if (date && patch.started_at) {
    const startMs = new Date(patch.started_at).getTime()
    const endMs = patch.ended_at ? new Date(patch.ended_at).getTime() : Date.now()
    await trimOverlaps(date, startMs, endMs, id)
  }
  const { error } = await supabase.from('activity_blocks').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await supabase.from('activity_blocks').delete().eq('id', id)
  if (error) throw error
}

// ─── Статистика за период ───────────────────────────────────

export interface DayAgg {
  date: string
  hoursByFocus: Record<FocusKey, number>
  focusH: number       // бизнес + спорт + блог
  otherH: number
  mood: number | null
}

function emptyFocus(): Record<FocusKey, number> {
  return { biz: 0, sport: 0, blog: 0, other: 0 }
}

export async function getRangeStats(startISO: string, endISO: string): Promise<DayAgg[]> {
  const [{ data: blockData }, { data: diaryData }] = await Promise.all([
    supabase.from('activity_blocks').select('*').gte('date', startISO).lte('date', endISO).order('started_at', { ascending: true }),
    supabase.from('diary_entries').select('date, mood').gte('date', startISO).lte('date', endISO),
  ])

  const blocks = (blockData || []) as ActivityBlock[]
  const moodByDate = new Map<string, number | null>()
  for (const d of (diaryData || []) as { date: string; mood: number | null }[]) {
    moodByDate.set(d.date, d.mood)
  }

  const byDate = new Map<string, ActivityBlock[]>()
  for (const b of blocks) {
    if (!byDate.has(b.date)) byDate.set(b.date, [])
    byDate.get(b.date)!.push(b)
  }

  const now = Date.now()
  const result: DayAgg[] = []
  // итерируем каждый день от start до end включительно
  const cur = new Date(startISO + 'T12:00:00Z')
  const end = new Date(endISO + 'T12:00:00Z')
  while (cur <= end) {
    const date = cur.toISOString().slice(0, 10)
    const dayBlocks = byDate.get(date) ?? []
    const hoursByFocus = emptyFocus()

    dayBlocks.forEach((b, idx) => {
      const nextStart = dayBlocks[idx + 1] ? +new Date(dayBlocks[idx + 1].started_at) : null
      let endMs = b.ended_at ? +new Date(b.ended_at) : (nextStart ?? now)
      if (nextStart != null && endMs > nextStart) endMs = nextStart
      const h = Math.max(0, (endMs - +new Date(b.started_at)) / 3_600_000)
      hoursByFocus[b.focus] += h
    })

    const focusH = hoursByFocus.biz + hoursByFocus.sport + hoursByFocus.blog
    result.push({ date, hoursByFocus, focusH, otherH: hoursByFocus.other, mood: moodByDate.get(date) ?? null })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

// ─── Дневник ───────────────────────────────────────────────

export interface Reflection {
  focus: string
  text: string
  time: string  // "14:32" MSK
}

export interface DiaryEntry {
  id?: string
  date: string
  done: string
  achieved: string
  not_achieved: string
  thoughts: string
  goals: string
  mood: number | null
  raw_transcript?: string
  reflections?: Reflection[]
}

export async function getDiary(date: string): Promise<DiaryEntry | null> {
  const { data, error } = await supabase
    .from('diary_entries')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  return (data as DiaryEntry) ?? null
}

export async function saveDiary(entry: DiaryEntry): Promise<void> {
  const { error } = await supabase
    .from('diary_entries')
    .upsert(entry, { onConflict: 'date' })
  if (error) throw error
}
