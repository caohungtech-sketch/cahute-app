import { Actions, ActionsButton, ActionsGroup, ActionsLabel } from 'konsta/react'
import { actionLabel, STAFF_TRANSITIONS } from '../lib/taskStatus'
import type { Task, TaskStatus } from '../lib/types'

interface Props {
  task: Task | null // null = đóng
  onClose: () => void
  onPick: (task: Task, next: TaskStatus) => void
}

// Bảng chọn trạng thái trượt từ đáy (kiểu iOS). Chỉ liệt kê các bước nhân viên được phép (khớp trigger trong DB).
export default function StatusSheet({ task, onClose, onPick }: Props) {
  const options = task ? STAFF_TRANSITIONS[task.status] : []

  return (
    <Actions opened={!!task} onBackdropClick={onClose}>
      <ActionsGroup>
        <ActionsLabel>{task?.title}</ActionsLabel>
        {task &&
          options.map((s) => (
            <ActionsButton
              key={s}
              bold={s === 'done'}
              colors={s === 'done' ? { textIos: 'text-green-700 dark:text-green-400' } : undefined}
              onClick={() => {
                onClose()
                onPick(task, s)
              }}
            >
              {actionLabel(task.status, s)}
            </ActionsButton>
          ))}
      </ActionsGroup>
      <ActionsGroup>
        <ActionsButton onClick={onClose}>Huỷ</ActionsButton>
      </ActionsGroup>
    </Actions>
  )
}
