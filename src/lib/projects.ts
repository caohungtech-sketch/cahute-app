import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabase'

const EMPTY: Record<string, string[]> = {}

// user_id theo từng dự án, đọc từ project_members hoặc project_managers.
function useProjectUsers(table: 'project_members' | 'project_managers', projectIds: string[]) {
  const ids = [...projectIds].sort()
  const { data: users = EMPTY, refetch } = useQuery({
    queryKey: [table, ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('project_id, user_id').in('project_id', ids)
      if (error) throw error
      const map: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, []]))
      for (const r of data) map[r.project_id].push(r.user_id)
      return map
    },
  })

  return {
    users: ids.length ? users : EMPTY,
    reload: async () => {
      if (ids.length) await refetch()
    },
  }
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
