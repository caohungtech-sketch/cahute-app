import { getCurrentPosition } from '../../lib/geolocation'
import { supabase } from '../../lib/supabase'
import type { TaskStatus } from '../../lib/types'

export const TASK_SELECT =
  'id, project_id, title, description, status, result, created_by, due_at, created_at, updated_at, task_assignees(user_id)'

// Trả về thông báo lỗi, hoặc null nếu thành công. Database tự kiểm tra quyền + luật chuyển trạng thái,
// và tự ghi lịch sử (task_status_events).
// withLocation: nhân viên đổi trạng thái → gửi kèm vị trí hiện tại (nếu lấy được trong ~8 giây).
export async function setTaskStatus(
  taskId: string,
  next: TaskStatus,
  { withLocation = false }: { withLocation?: boolean } = {},
): Promise<string | null> {
  const pos = withLocation ? await getCurrentPosition() : null
  const { data, error } = await supabase.rpc('set_task_status', {
    p_task_id: taskId,
    p_status: next,
    p_lat: pos?.lat ?? null,
    p_lon: pos?.lon ?? null,
    p_accuracy: pos?.accuracy ?? null,
  })
  if (error) return error.message
  if (!data) return 'Bạn không có quyền đổi trạng thái việc này.'
  return null
}
