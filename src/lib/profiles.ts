import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from './supabase'
import type { Profile } from './types'

const EMPTY: Profile[] = []

// Danh sách người dùng (dùng để hiện tên). Ít thay đổi nên giữ trong bộ nhớ đệm 5 phút, tải lại khi cần.
export function useProfiles() {
  const { data: list = EMPTY, refetch } = useQuery({
    queryKey: ['profiles'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_path, deleted_at')
        .order('full_name')
        .limit(1000)
      if (error) throw error
      return data as Profile[]
    },
  })

  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list])

  return {
    list,
    byId,
    reload: async () => {
      await refetch()
    },
  }
}

export function displayName(p: Profile | undefined): string {
  return p ? p.full_name || 'Chưa đặt tên' : 'Không rõ'
}
