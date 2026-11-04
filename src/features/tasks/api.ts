import { supabase } from '../../lib/supabase'
import type { TaskStatus } from '../../lib/types'

export const TASK_SELECT =
  'id, team_id, title, description, status, result, created_by, due_at, created_at, updated_at, task_assignees(user_id)'

// Trả về thông báo lỗi, hoặc null nếu thành công. Database tự kiểm tra quyền + luật chuyển trạng thái.
export async function setTaskStatus(taskId: string, next: TaskStatus): Promise<string | null> {
  const { data, error } = await supabase.from('tasks').update({ status: next }).eq('id', taskId).select('id')
  if (error) return error.message
  if (!data?.length) return 'Bạn không có quyền đổi trạng thái việc này.'
  return null
}
