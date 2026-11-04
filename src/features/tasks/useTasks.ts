import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Task, TaskStatus } from '../../lib/types'

const PAGE_SIZE = 50
const SELECT = 'id, team_id, title, description, status, created_by, due_at, created_at, updated_at, task_assignees(user_id)'

// Danh sách + Kanban dùng chung hook này. RLS tự lọc: nhân viên chỉ nhận việc được giao.
export function useTasks(teamId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const countRef = useRef(PAGE_SIZE) // số dòng đang hiển thị, để tải lại đúng phạm vi

  const fetchRange = useCallback(
    async (from: number, to: number) => {
      let q = supabase.from('tasks').select(SELECT).order('updated_at', { ascending: false }).range(from, to)
      if (teamId) q = q.eq('team_id', teamId)
      return q
    },
    [teamId],
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

  // Realtime: có thay đổi thì tải lại (gộp nhiều sự kiện trong 300 ms).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(reload, 300)
    }
    const channel = supabase
      .channel(`tasks-${teamId ?? 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees' }, schedule)
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [reload, teamId])

  // Optimistic update; trả về thông báo lỗi (nếu có) sau khi đã hoàn tác.
  const updateStatus = useCallback(async (task: Task, next: TaskStatus): Promise<string | null> => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
    const { data, error } = await supabase.from('tasks').update({ status: next }).eq('id', task.id).select('id')
    if (error || !data?.length) {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t)))
      return error?.message ?? 'Bạn không có quyền đổi trạng thái việc này.'
    }
    return null
  }, [])

  return { tasks, loading, error, hasMore, reload, loadMore, updateStatus }
}
