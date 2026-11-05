import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { STATUSES } from '../../lib/taskStatus'
import type { Task, TaskStatus } from '../../lib/types'
import { setTaskStatus, TASK_SELECT } from './api'
import { useTasksRealtime } from './useTasks'

export type StatusFilter = TaskStatus | 'all'
type Counts = Record<StatusFilter, number>

const EMPTY_COUNTS: Counts = { all: 0, todo: 0, in_progress: 0, paused: 0, done: 0 }

// Dữ liệu cho bảng: phân trang + lọc trạng thái ở server, kèm số lượng theo từng trạng thái.
export function useTaskPage(projectId: string | null, status: StatusFilter, page: number, pageSize: number) {
  const [rows, setRows] = useState<Task[]>([])
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
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

    if (countRes.some((c) => c.error)) setError('Không tải được danh sách công việc.')
    else {
      const next = { ...EMPTY_COUNTS }
      STATUSES.forEach((s, i) => (next[s] = countRes[i].count ?? 0))
      next.all = STATUSES.reduce((sum, s) => sum + next[s], 0)
      setCounts(next)
    }

    // PGRST103: trang vượt quá số dòng (vừa có việc bị xoá/đổi trạng thái) → trang rỗng, component tự lùi trang.
    if (res.error && res.error.code !== 'PGRST103') setError('Không tải được danh sách công việc.')
    else setRows((res.data as Task[] | null) ?? [])
    setLoading(false)
  }, [projectId, status, page, pageSize])

  useEffect(() => {
    load()
  }, [load])

  useTasksRealtime(`table-${projectId ?? 'all'}`, load)

  const updateStatus = useCallback(
    async (task: Task, next: TaskStatus): Promise<string | null> => {
      setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
      const err = await setTaskStatus(task.id, next)
      if (err) setRows((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
      else load() // cập nhật số lượng theo trạng thái
      return err
    },
    [load],
  )

  return { rows, counts, total: counts[status], loading, error, reload: load, updateStatus }
}
