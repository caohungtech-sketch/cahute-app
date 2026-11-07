import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { vnStartOfDay } from '../../lib/time'
import { STATUSES } from '../../lib/taskStatus'
import type { Task, TaskStatus } from '../../lib/types'
import { setTaskStatus, TASK_SELECT } from './api'
import { TASKS_KEY, useTasksRealtime } from './useTasks'

export type StatusFilter = TaskStatus | 'all'
type Counts = Record<StatusFilter, number>
type PageData = { rows: Task[]; counts: Counts }

export type TaskSortKey = 'title' | 'status' | 'due_at' | 'updated_at'
export interface TaskSort {
  key: TaskSortKey
  desc: boolean
}
export const DEFAULT_SORT: TaskSort = { key: 'updated_at', desc: true }

// Lọc theo hạn. 'range': ngày 'YYYY-MM-DD' theo giờ VN, bỏ trống một đầu = không giới hạn đầu đó.
export type DueFilter =
  | { kind: 'all' | 'overdue' | 'today' | 'next7' | 'none' }
  | { kind: 'range'; from: string; to: string }

export interface TaskPageOptions {
  sort?: TaskSort
  assigneeId?: string | null
  due?: DueFilter
}

const EMPTY_COUNTS: Counts = { all: 0, todo: 0, in_progress: 0, paused: 0, done: 0 }
const EMPTY_ROWS: Task[] = []
const ALL_DUE: DueFilter = { kind: 'all' }

// Phần chung của truy vấn danh sách và truy vấn đếm. Ép kiểu bên trong vì kiểu đầy đủ của
// supabase-js quá sâu cho TypeScript ("excessively deep") khi đặt làm ràng buộc generic.
interface Filterable {
  eq(column: string, value: unknown): Filterable
  neq(column: string, value: unknown): Filterable
  lt(column: string, value: unknown): Filterable
  gte(column: string, value: unknown): Filterable
  is(column: string, value: null): Filterable
}

function applyFilters<Q>(query: Q, projectId: string | null, assigneeId: string | null, due: DueFilter): Q {
  let q = query as unknown as Filterable
  if (projectId) q = q.eq('project_id', projectId)
  if (assigneeId) q = q.eq('af.user_id', assigneeId) // af = task_assignees!inner, xem selectFor
  const day = (ymd?: string, add = 0) => vnStartOfDay(ymd, add).toISOString()
  switch (due.kind) {
    case 'overdue':
      q = q.lt('due_at', new Date().toISOString()).neq('status', 'done')
      break
    case 'today':
      q = q.gte('due_at', day()).lt('due_at', day(undefined, 1))
      break
    case 'next7': // hôm nay + 7 ngày tới
      q = q.gte('due_at', day()).lt('due_at', day(undefined, 8))
      break
    case 'none':
      q = q.is('due_at', null)
      break
    case 'range':
      if (due.from) q = q.gte('due_at', day(due.from))
      if (due.to) q = q.lt('due_at', day(due.to, 1))
      break
  }
  return q as unknown as Q
}

// Lọc theo người làm: nối thêm task_assignees!inner (đặt tên af) để lọc,
// vẫn giữ task_assignees đầy đủ để hiển thị mọi người làm.
const selectFor = (base: string, assigneeId: string | null) =>
  assigneeId ? `${base}, af:task_assignees!inner(user_id)` : base

// Dữ liệu cho bảng: phân trang, lọc, sắp xếp ở server, kèm số lượng theo từng trạng thái.
export function useTaskPage(
  projectId: string | null,
  status: StatusFilter,
  page: number,
  pageSize: number,
  { sort = DEFAULT_SORT, assigneeId = null, due = ALL_DUE }: TaskPageOptions = {},
) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () => [...TASKS_KEY, 'page', projectId, status, page, pageSize, sort, assigneeId, due],
    [projectId, status, page, pageSize, sort, assigneeId, due],
  )

  const query = useQuery({
    queryKey,
    placeholderData: keepPreviousData, // giữ trang cũ trong lúc tải trang mới, không nháy trắng
    queryFn: async (): Promise<PageData> => {
      let q = applyFilters(supabase.from('tasks').select(selectFor(TASK_SELECT, assigneeId)), projectId, assigneeId, due)
        .order(sort.key, { ascending: !sort.desc, nullsFirst: false })
        .order('id') // thứ tự ổn định khi nhiều việc trùng giá trị
        .range(page * pageSize, page * pageSize + pageSize - 1)
      if (status !== 'all') q = q.eq('status', status)

      const countFor = (s: TaskStatus) =>
        applyFilters(
          supabase.from('tasks').select(selectFor('id', assigneeId), { count: 'exact', head: true }),
          projectId,
          assigneeId,
          due,
        ).eq('status', s)

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
    async (task: Task, next: TaskStatus, opts?: { withLocation?: boolean }): Promise<string | null> => {
      const patch = (s: TaskStatus) =>
        queryClient.setQueryData<PageData>(queryKey, (old) =>
          old && { ...old, rows: old.rows.map((t) => (t.id === task.id ? { ...t, status: s } : t)) },
        )
      await queryClient.cancelQueries({ queryKey })
      patch(next)
      const err = await setTaskStatus(task.id, next, opts)
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
