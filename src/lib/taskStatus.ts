import type { TaskStatus } from './types'

export const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'paused', 'done']

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Chưa làm',
  in_progress: 'Đang làm',
  paused: 'Tạm dừng',
  done: 'Hoàn thành',
}

export const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  paused: 'bg-amber-100 text-amber-800',
  done: 'bg-green-100 text-green-800',
}

// Phải khớp với trigger tasks_before_update trong database.
export const STAFF_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in_progress'],
  in_progress: ['paused', 'done'],
  paused: ['in_progress', 'done'],
  done: [],
}

export function nextStatuses(current: TaskStatus, isManager: boolean): TaskStatus[] {
  return isManager ? STATUSES.filter((s) => s !== current) : STAFF_TRANSITIONS[current]
}

export function actionLabel(from: TaskStatus, to: TaskStatus): string {
  if (to === 'in_progress') return from === 'todo' ? 'Bắt đầu làm' : from === 'paused' ? 'Tiếp tục' : 'Đang làm'
  if (to === 'paused') return 'Tạm dừng'
  if (to === 'done') return 'Hoàn thành'
  return 'Về Chưa làm'
}
