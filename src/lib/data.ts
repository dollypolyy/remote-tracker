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
    const h = (end.getTime() - start.getTime()) / 3_600_000
    hoursByFocus[block.focus] = (hoursByFocus[block.focus] ?? 0) + h
  }

  const currentBlock = blocks.find((b) => !b.ended_at) ?? null
  return { blocks, hoursByFocus, currentBlock }
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
