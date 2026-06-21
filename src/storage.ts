import { supabase } from './lib/supabase'
import type { Collection, CollectionMap } from './types'

export interface StorageAdapter {
  getAll<C extends Collection>(collection: C): Promise<CollectionMap[C][]>
  upsert<C extends Collection>(collection: C, item: CollectionMap[C]): Promise<void>
  remove<C extends Collection>(collection: C, id: string): Promise<void>
  exportAll(): Promise<Record<string, unknown[]>>
  importAll(data: Record<string, unknown[]>): Promise<void>
}

const supabaseAdapter: StorageAdapter = {
  async getAll<C extends Collection>(collection: C): Promise<CollectionMap[C][]> {
    const { data, error } = await supabase.from(collection).select('data')
    if (error) { console.error(error); return [] }
    return (data ?? []).map((row) => row.data as CollectionMap[C])
  },

  async upsert<C extends Collection>(collection: C, item: CollectionMap[C]): Promise<void> {
    const { error } = await supabase
      .from(collection)
      .upsert({ id: item.id, data: item, updated_at: new Date().toISOString() })
    if (error) console.error(error)
  },

  async remove<C extends Collection>(collection: C, id: string): Promise<void> {
    const { error } = await supabase.from(collection).delete().eq('id', id)
    if (error) console.error(error)
  },

  async exportAll() {
    const collections: Collection[] = ['ways', 'people', 'hypotheses', 'diary']
    const out: Record<string, unknown[]> = {}
    for (const c of collections) {
      out[c] = await supabaseAdapter.getAll(c)
    }
    return out
  },

  async importAll(data: Record<string, unknown[]>) {
    const collections: Collection[] = ['ways', 'people', 'hypotheses', 'diary']
    for (const c of collections) {
      if (Array.isArray(data[c])) {
        for (const item of data[c]) {
          await supabaseAdapter.upsert(c, item as CollectionMap[typeof c])
        }
      }
    }
  },
}

export const storage: StorageAdapter = supabaseAdapter

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
