import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import type { Task, TaskStatus } from '../../lib/types'
import { setTaskStatus, TASK_SELECT } from './api'
import { TASKS_KEY } from './useTasks'

// Một công việc theo id, tự cập nhật khi việc hoặc danh sách người làm thay đổi (Realtime).
// null = không tìm thấy, hoặc RLS chặn (ví dụ nhân viên vừa bị gỡ khỏi việc).
export function useTask(id: string) {
  const queryClient = useQueryClient()
  const queryKey = useMemo(() => [...TASKS_KEY, 'one', id], [id])

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()
      if (error) throw error
      return (data as Task | null) ?? null
    },
  })

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey })
    const channel = supabase
      .channel(`task-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `id=eq.${id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees', filter: `task_id=eq.${id}` }, refresh)
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, queryClient, queryKey])

  // Optimistic update; trả về thông báo lỗi (nếu có) sau khi đã hoàn tác.
  const updateStatus = useCallback(
    async (next: TaskStatus, opts?: { withLocation?: boolean }): Promise<string | null> => {
      const prev = queryClient.getQueryData<Task | null>(queryKey)
      if (!prev) return null
      await queryClient.cancelQueries({ queryKey })
      queryClient.setQueryData<Task | null>(queryKey, () => ({ ...prev, status: next }))
      const err = await setTaskStatus(id, next, opts)
      if (err) queryClient.setQueryData<Task | null>(queryKey, prev)
      queryClient.invalidateQueries({ queryKey: TASKS_KEY }) // danh sách + số lượng theo trạng thái
      return err
    },
    [id, queryClient, queryKey],
  )

  // Ghi cột result (nhân viên chỉ được sửa cột này; database cũng chặn các cột khác).
  const saveResult = useCallback(
    async (result: string): Promise<string | null> => {
      const { data, error } = await supabase.from('tasks').update({ result }).eq('id', id).select(TASK_SELECT).single()
      if (error) return error.message
      queryClient.setQueryData<Task | null>(queryKey, data as Task)
      queryClient.invalidateQueries({ queryKey: TASKS_KEY })
      return null
    },
    [id, queryClient, queryKey],
  )

  return {
    task: query.data,
    loading: query.isPending,
    error: query.isError ? 'Không tải được công việc.' : null,
    reload: query.refetch,
    updateStatus,
    saveResult,
  }
}
