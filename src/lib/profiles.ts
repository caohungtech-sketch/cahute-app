import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import type { Profile } from './types'

// Danh sách người dùng (dùng để hiện tên). Cache trong phiên, tải lại khi cần.
let cache: Promise<Profile[]> | null = null

export function loadProfiles(force = false): Promise<Profile[]> {
  if (!cache || force) {
    cache = Promise.resolve(
      supabase.from('profiles').select('id, full_name, role, avatar_path, deleted_at').order('full_name').limit(1000),
    ).then(({ data, error }) => {
      if (error) {
        cache = null
        throw error
      }
      return data as Profile[]
    })
  }
  return cache
}

export function clearProfilesCache() {
  cache = null
}

export function useProfiles() {
  const [list, setList] = useState<Profile[]>([])

  useEffect(() => {
    loadProfiles().then(setList).catch(() => {})
  }, [])

  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list])

  return {
    list,
    byId,
    reload: async () => setList(await loadProfiles(true)),
  }
}

export function displayName(p: Profile | undefined): string {
  return p ? p.full_name || 'Chưa đặt tên' : 'Không rõ'
}
