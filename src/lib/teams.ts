import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Thành viên (user_id) của các nhóm. RLS: quản lý thấy thành viên nhóm mình.
export function useTeamMembers(teamIds: string[]) {
  const [members, setMembers] = useState<Record<string, string[]>>({})
  const key = teamIds.join(',')

  const reload = useCallback(async () => {
    const ids = key ? key.split(',') : []
    if (!ids.length) return setMembers({})
    const { data } = await supabase.from('team_members').select('team_id, user_id').in('team_id', ids)
    const map: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]))
    for (const r of data ?? []) map[r.team_id].push(r.user_id)
    setMembers(map)
  }, [key])

  useEffect(() => {
    reload()
  }, [reload])

  return { members, reload }
}
