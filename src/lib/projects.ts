import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// Thành viên (user_id) của các dự án. RLS: quản lý thấy thành viên dự án mình.
export function useProjectMembers(projectIds: string[]) {
  const [members, setMembers] = useState<Record<string, string[]>>({})
  const key = projectIds.join(',')

  const reload = useCallback(async () => {
    const ids = key ? key.split(',') : []
    if (!ids.length) return setMembers({})
    const { data } = await supabase.from('project_members').select('project_id, user_id').in('project_id', ids)
    const map: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]))
    for (const r of data ?? []) map[r.project_id].push(r.user_id)
    setMembers(map)
  }, [key])

  useEffect(() => {
    reload()
  }, [reload])

  return { members, reload }
}
