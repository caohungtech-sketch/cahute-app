import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Task, TaskStatus } from '../../lib/types'
import { setTaskStatus, TASK_SELECT } from './api'

const PAGE_SIZE = 50

// Mọi truy vấn danh sách việc đều nằm dưới khoá 'tasks' → làm mới một lần là cập nhật cả bảng lẫn Kanban.
export const TASKS_KEY = ['tasks'] as const

// Dữ liệu cho Kanban: tải dần (Tải thêm). RLS tự lọc: nhân viên chỉ nhận việc được giao.
export function useTasks(projectId: string | null) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => [...TASKS_KEY, 'kanban', projectId], [projectId])

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('tasks')
        .select(TASK_SELECT)
        .order('updated_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1)
      if (projectId) q = q.eq('project_id', projectId)
      const { data, error } = await q
      if (error) throw error
      return data as Task[]
    },
    getNextPageParam: (last, all) => (last.length === PAGE_SIZE ? all.reduce((n, p) => n + p.length, 0) : undefined),
  })

  // Gộp các trang, bỏ việc trùng (việc vừa cập nhật có thể nhảy sang trang khác giữa hai lần tải).
  const tasks = useMemo(() => {
    const seen = new Set<string>()
    return (query.data?.pages.flat() ?? []).filter((t) => !seen.has(t.id) && seen.add(t.id))
  }, [query.data])

  const { refetch, fetchNextPage } = query
  const reload = useCallback(async () => {
    await refetch()
  }, [refetch])

  const loadMore = useCallback(async () => {
    await fetchNextPage()
  }, [fetchNextPage])

  useTasksRealtime(`kanban-${projectId ?? 'all'}`, () => queryClient.invalidateQueries({ queryKey: TASKS_KEY }))

  // Optimistic update; trả về thông báo lỗi (nếu có) sau khi đã hoàn tác.
  const updateStatus = useCallback(
    async (task: Task, next: TaskStatus): Promise<string | null> => {
      const patch = (status: TaskStatus) =>
        queryClient.setQueryData<InfiniteData<Task[]>>(queryKey, (old) =>
          old && { ...old, pages: old.pages.map((p) => p.map((t) => (t.id === task.id ? { ...t, status } : t))) },
        )
      await queryClient.cancelQueries({ queryKey })
      patch(next)
      const err = await setTaskStatus(task.id, next)
      if (err) patch(task.status)
      else queryClient.invalidateQueries({ queryKey: TASKS_KEY })
      return err
    },
    [queryClient, queryKey],
  )

  let error: string | null = null
  if (query.isFetchNextPageError) error = 'Không tải thêm được.'
  else if (query.isError) error = 'Không tải được danh sách công việc.'

  return { tasks, loading: query.isPending, error, hasMore: query.hasNextPage, reload, loadMore, updateStatus }
}

// Có thay đổi ở tasks / task_assignees thì gọi onChange (gộp sự kiện trong 300 ms).
// Dùng ref để kênh chỉ đăng ký một lần, kể cả khi onChange đổi (chuyển trang, đổi bộ lọc…).
export function useTasksRealtime(name: string, onChange: () => void) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => onChangeRef.current(), 300)
    }
    const channel = supabase
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, schedule)
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [name])
}
