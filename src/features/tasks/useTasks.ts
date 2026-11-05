import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Task, TaskStatus } from '../../lib/types'
import { setTaskStatus, TASK_SELECT } from './api'

const PAGE_SIZE = 50

// Dữ liệu cho Kanban: tải dần (Tải thêm). RLS tự lọc: nhân viên chỉ nhận việc được giao.
export function useTasks(projectId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const countRef = useRef(PAGE_SIZE) // số dòng đang hiển thị, để tải lại đúng phạm vi

  const fetchRange = useCallback(
    async (from: number, to: number) => {
      let q = supabase.from('tasks').select(TASK_SELECT).order('updated_at', { ascending: false }).range(from, to)
      if (projectId) q = q.eq('project_id', projectId)
      return q
    },
    [projectId],
  )

  const reload = useCallback(async () => {
    setError(null)
    const { data, error } = await fetchRange(0, countRef.current - 1)
    if (error) setError('Không tải được danh sách công việc.')
    else {
      setTasks(data as Task[])
      setHasMore(data.length === countRef.current)
    }
    setLoading(false)
  }, [fetchRange])

  const loadMore = useCallback(async () => {
    const { data, error } = await fetchRange(tasks.length, tasks.length + PAGE_SIZE - 1)
    if (error) return setError('Không tải thêm được.')
    countRef.current = tasks.length + data.length
    setTasks((prev) => [...prev, ...(data as Task[]).filter((t) => !prev.some((p) => p.id === t.id))])
    setHasMore(data.length === PAGE_SIZE)
  }, [fetchRange, tasks.length])

  useEffect(() => {
    countRef.current = PAGE_SIZE
    setLoading(true)
    reload()
  }, [reload])

  useTasksRealtime(`kanban-${projectId ?? 'all'}`, reload)

  // Optimistic update; trả về thông báo lỗi (nếu có) sau khi đã hoàn tác.
  const updateStatus = useCallback(async (task: Task, next: TaskStatus): Promise<string | null> => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
    const err = await setTaskStatus(task.id, next)
    if (err) setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
    return err
  }, [])

  return { tasks, loading, error, hasMore, reload, loadMore, updateStatus }
}

// Có thay đổi ở tasks / task_assignees thì gọi onChange (gộp sự kiện trong 300 ms).
// Dùng ref để kênh chỉ đăng ký một lần, kể cả khi onChange đổi (chuyển trang, đổi bộ lọc…).
export function useTasksRealtime(name: string, onChange: () => void) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

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
