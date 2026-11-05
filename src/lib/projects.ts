import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// user_id theo từng dự án, đọc từ project_members hoặc project_managers.
function useProjectUsers(table: 'project_members' | 'project_managers', projectIds: string[]) {
  const [users, setUsers] = useState<Record<string, string[]>>({})
  const key = projectIds.join(',')

  const reload = useCallback(async () => {
    const ids = key ? key.split(',') : []
    if (!ids.length) return setUsers({})
    const { data } = await supabase.from(table).select('project_id, user_id').in('project_id', ids)
    const map: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]))
    for (const r of data ?? []) map[r.project_id].push(r.user_id)
    setUsers(map)
  }, [table, key])

  useEffect(() => {
    reload()
  }, [reload])

  return { users, reload }
}

// Thành viên (nhân viên) của các dự án. RLS: quản lý thấy thành viên dự án mình.
export function useProjectMembers(projectIds: string[]) {
  const { users, reload } = useProjectUsers('project_members', projectIds)
  return { members: users, reload }
}

// Quản lý của các dự án (một dự án có một hoặc nhiều quản lý).
export function useProjectManagers(projectIds: string[]) {
  const { users, reload } = useProjectUsers('project_managers', projectIds)
  return { managers: users, reload }
}
