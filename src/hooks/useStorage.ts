import { useState, useCallback, useEffect } from 'react'
import { storage } from '../storage'
import type { Collection, CollectionMap } from '../types'

export function useCollection<C extends Collection>(collection: C) {
  const [items, setItems] = useState<CollectionMap[C][]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const data = await storage.getAll(collection)
    setItems(data)
    setLoading(false)
  }, [collection])

  useEffect(() => { refresh() }, [refresh])

  const upsert = useCallback(
    async (item: CollectionMap[C]) => {
      await storage.upsert(collection, item)
      refresh()
    },
    [collection, refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await storage.remove(collection, id)
      refresh()
    },
    [collection, refresh]
  )

  return { items, loading, upsert, remove, refresh }
}
