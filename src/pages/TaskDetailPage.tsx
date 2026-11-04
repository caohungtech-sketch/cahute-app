import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { btn, ErrorBox, Skeleton, StatusBadge, Toast } from '../components/ui'
import Comments from '../features/tasks/Comments'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { actionLabel, nextStatuses } from '../lib/taskStatus'
import { formatDateTime } from '../lib/time'
import type { Task, TaskStatus } from '../lib/types'

const SELECT = 'id, team_id, title, description, status, created_by, due_at, created_at, updated_at, task_assignees(user_id)'

export default function TaskDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session, managedTeams } = useAuth()
  const { byId } = useProfiles()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  const uid = session!.user.id

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.from('tasks').select(SELECT).eq('id', id).maybeSingle()
    if (error) setError('Không tải được công việc.')
    else if (!data) setError('Không tìm thấy công việc, hoặc bạn không còn được giao việc này.')
    setTask((data as Task) ?? null)
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
    const channel = supabase
      .channel(`task-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_assignees', filter: `task_id=eq.${id}` }, () => load())
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id, load])

  if (loading) return <Skeleton rows={2} />
  if (!task)
    return (
      <div className="space-y-3">
        <ErrorBox message={error ?? 'Không tìm thấy công việc.'} onRetry={load} />
        <Link to="/" className={btn.secondary}>
          ← Về danh sách
        </Link>
      </div>
    )

  const isManager = managedTeams.some((t) => t.id === task.team_id)
  const isAssignee = task.task_assignees.some((a) => a.user_id === uid)
  const actions = isManager || isAssignee ? nextStatuses(task.status, isManager) : []

  async function changeStatus(next: TaskStatus) {
    const prev = task!
    setTask({ ...prev, status: next })
    const { data, error } = await supabase.from('tasks').update({ status: next }).eq('id', prev.id).select('id')
    if (error || !data?.length) {
      setTask(prev)
      setToast(error?.message ?? 'Bạn không có quyền đổi trạng thái việc này.')
    }
  }

  async function remove() {
    if (!confirm('Xoá công việc này? Toàn bộ báo cáo và ảnh liên quan cũng bị xoá.')) return
    const { error } = await supabase.from('tasks').delete().eq('id', task!.id)
    if (error) setToast(error.message)
    else navigate('/', { replace: true })
  }

  const overdue = task.due_at && task.status !== 'done' && new Date(task.due_at) < new Date()

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="mb-3 inline-flex min-h-12 items-center text-sm text-blue-700">
        ← Công việc
      </Link>

      <article className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold break-words">{task.title}</h1>
          <StatusBadge status={task.status} />
        </div>

        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-gray-500">Người làm</dt>
            <dd>{task.task_assignees.length ? task.task_assignees.map((a) => displayName(byId.get(a.user_id))).join(', ') : 'Chưa giao cho ai'}</dd>
          </div>
          {task.due_at && (
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-gray-500">Hạn</dt>
              <dd className={overdue ? 'font-semibold text-red-700' : ''}>
                {formatDateTime(task.due_at)}
                {overdue && ' (quá hạn)'}
              </dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-24 shrink-0 text-gray-500">Người giao</dt>
            <dd>{displayName(byId.get(task.created_by ?? ''))}</dd>
          </div>
        </dl>

        {task.description && <p className="mt-4 whitespace-pre-wrap break-words">{task.description}</p>}

        {actions.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {actions.map((s) => (
              <button
                key={s}
                className={s === 'done' ? `${btn.primary} bg-green-600 active:bg-green-700` : btn.secondary}
                onClick={() => changeStatus(s)}
              >
                {actionLabel(task.status, s)}
              </button>
            ))}
          </div>
        )}

        {isManager && (
          <div className="mt-4 flex gap-2 border-t border-gray-100 pt-4">
            <Link to={`/tasks/${task.id}/edit`} className={`${btn.secondary} flex-1`}>
              Sửa / đổi người
            </Link>
            <button className={btn.danger} onClick={remove}>
              Xoá
            </button>
          </div>
        )}
      </article>

      <Comments taskId={task.id} userId={uid} profilesById={byId} />
      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}
