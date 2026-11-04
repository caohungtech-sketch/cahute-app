import { Link } from 'react-router'
import { StatusBadge } from '../../components/ui'
import { displayName } from '../../lib/profiles'
import { actionLabel, STAFF_TRANSITIONS } from '../../lib/taskStatus'
import { formatDateTime } from '../../lib/time'
import type { Profile, Task, TaskStatus } from '../../lib/types'

interface Props {
  task: Task
  profilesById: Map<string, Profile>
  canChangeStatus: boolean
  showStatus: boolean
  onChangeStatus: (task: Task, next: TaskStatus) => void
}

export default function TaskCard({ task, profilesById, canChangeStatus, showStatus, onChangeStatus }: Props) {
  const overdue = task.due_at && task.status !== 'done' && new Date(task.due_at) < new Date()
  const names = task.task_assignees.map((a) => displayName(profilesById.get(a.user_id)))
  // Trên thẻ chỉ hiện các bước "tự nhiên"; quản lý đổi tuỳ ý trong trang chi tiết.
  const actions = canChangeStatus ? STAFF_TRANSITIONS[task.status] : []

  return (
    <article className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200">
      <Link to={`/tasks/${task.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 font-medium">{task.title}</h3>
          {showStatus && <StatusBadge status={task.status} />}
        </div>
        {task.due_at && (
          <p className={`mt-1 text-xs ${overdue ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
            Hạn: {formatDateTime(task.due_at)}
            {overdue && ' (quá hạn)'}
          </p>
        )}
        <p className="mt-1 line-clamp-1 text-xs text-gray-500">👤 {names.length ? names.join(', ') : 'Chưa giao cho ai'}</p>
        {task.result && <p className="mt-1 line-clamp-2 text-xs text-gray-700">✅ {task.result}</p>}
      </Link>

      {actions.length > 0 && (
        <div className="mt-2 flex gap-2">
          {actions.map((s) => (
            <button
              key={s}
              className={`min-h-12 flex-1 rounded-lg text-sm font-medium ${
                s === 'done' ? 'bg-green-600 text-white active:bg-green-700' : 'bg-gray-100 text-gray-800 active:bg-gray-200'
              }`}
              onClick={() => onChangeStatus(task, s)}
            >
              {actionLabel(task.status, s)}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}
