import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { STATUSES } from '../../lib/taskStatus'
import type { Task, TaskStatus } from '../../lib/types'
import { setTaskStatus, TASK_SELECT } from './api'
import { TASKS_KEY, useTasksRealtime } from './useTasks'

export type StatusFilter = TaskStatus | 'all'
type Counts = Record<StatusFilter, number>
type PageData = { rows: Task[]; counts: Counts }

const EMPTY_COUNTS: Counts = { all: 0, todo: 0, in_progress: 0, paused: 0, done: 0 }
const EMPTY_ROWS: Task[] = []

// Dữ liệu cho bảng: phân trang + lọc trạng thái ở server, kèm số lượng theo từng trạng thái.
export function useTaskPage(projectId: string | null, status: StatusFilter, page: number, pageSize: number) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => [...TASKS_KEY, 'page', projectId, status, page, pageSize],
    [projectId, status, page, pageSize],
  )

  const query = useQuery({
    queryKey,
    placeholderData: keepPreviousData, // giữ trang cũ trong lúc tải trang mới, không nháy trắng
    queryFn: async (): Promise<PageData> => {
      let q = supabase
        .from('tasks')
        .select(TASK_SELECT)
        .order('updated_at', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1)
      if (projectId) q = q.eq('project_id', projectId)
      if (status !== 'all') q = q.eq('status', status)

      const countFor = (s: TaskStatus) => {
        let c = supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', s)
        if (projectId) c = c.eq('project_id', projectId)
        return c
      }

      const [res, ...countRes] = await Promise.all([q, ...STATUSES.map(countFor)])

      const countError = countRes.find((c) => c.error)?.error
      if (countError) throw countError
      // PGRST103: trang vượt quá số dòng (vừa có việc bị xoá/đổi trạng thái) → trang rỗng, component tự lùi trang.
      if (res.error && res.error.code !== 'PGRST103') throw res.error

      const counts = { ...EMPTY_COUNTS }
      STATUSES.forEach((s, i) => (counts[s] = countRes[i].count ?? 0))
      counts.all = STATUSES.reduce((sum, s) => sum + counts[s], 0)
      return { rows: (res.data as Task[] | null) ?? [], counts }
    },
  })

  useTasksRealtime(`table-${projectId ?? 'all'}`, () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }))

  const { refetch } = query
  const reload = useCallback(async () => {
    await refetch()
  }, [refetch])

  const updateStatus = useCallback(
    async (task: Task, next: TaskStatus): Promise<string | null> => {
      const patch = (s: TaskStatus) =>
        queryClient.setQueryData<PageData>(queryKey, (old) =>
          old && { ...old, rows: old.rows.map((t) => (t.id === task.id ? { ...t, status: s } : t)) },
        )
      await queryClient.cancelQueries({ queryKey })
      patch(next)
      const err = await setTaskStatus(task.id, next)
      if (err) patch(task.status)
      else queryClient.invalidateQueries({ queryKey: TASKS_KEY }) // cập nhật số lượng theo trạng thái
      return err
    },
    [queryClient, queryKey],
  )

  const counts = query.data?.counts ?? EMPTY_COUNTS
  return {
    rows: query.data?.rows ?? EMPTY_ROWS,
    counts,
    total: counts[status],
    loading: query.isPending,
    error: query.isError ? 'Không tải được danh sách công việc.' : null,
    reload,
    updateStatus,
  }
}
