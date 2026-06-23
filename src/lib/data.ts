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

  const blocks = (data || []) as ActivityBlock[]
  const now = new Date()
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

// Подрезает существующие блоки дня так, чтобы [startMs, endMs] никого не пересекал
async function trimOverlaps(today: string, startMs: number, endMs: number, exceptId?: string) {
  const { data } = await supabase.from('activity_blocks').select('*').eq('date', today)
  for (const b of (data || []) as ActivityBlock[]) {
    if (b.id === exceptId) continue
    const bs = +new Date(b.started_at)
    const be = b.ended_at ? +new Date(b.ended_at) : Date.now()
    if (be <= startMs || bs >= endMs) continue            // не пересекаются
    if (bs >= startMs && be <= endMs) {                   // полностью внутри → удалить
      await supabase.from('activity_blocks').delete().eq('id', b.id)
    } else if (bs < startMs && be > endMs) {              // охватывает новый → разрезать
      await supabase.from('activity_blocks').update({ ended_at: new Date(startMs).toISOString() }).eq('id', b.id)
      await supabase.from('activity_blocks').insert({
        date: today, started_at: new Date(endMs).toISOString(), ended_at: b.ended_at,
        activity_id: b.activity_id, focus: b.focus,
      })
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
  await trimOverlaps(today, startedAt.getTime(), now)
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
): Promise<void> {
  const { error } = await supabase.from('activity_blocks').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteBlock(id: string): Promise<void> {
  const { error } = await supabase.from('activity_blocks').delete().eq('id', id)
  if (error) throw error
}

// ─── Дневник ───────────────────────────────────────────────

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
