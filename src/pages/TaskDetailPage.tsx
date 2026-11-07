import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { btn, ErrorBox, inputCls, Skeleton, StatusBadge, Toast } from '../components/ui'
import { setTaskStatus, TASK_SELECT } from '../features/tasks/api'
import AssigneeChips from '../features/tasks/AssigneeChips'
import Comments from '../features/tasks/Comments'
import StatusHistory from '../features/tasks/StatusHistory'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { actionLabel, nextStatuses } from '../lib/taskStatus'
import { formatDateTime, fromLocalInput, toLocalInput } from '../lib/time'
import type { Task, TaskStatus } from '../lib/types'

interface Draft {
  title: string
  description: string
  due: string // giá trị datetime-local (giờ VN)
  result: string
}

const toDraft = (t: Task): Draft => ({
  title: t.title,
  description: t.description,
  due: toLocalInput(t.due_at),
  result: t.result,
})

const textareaCls =
  'block w-full resize-y rounded-xl border border-gray-300 bg-white p-3 text-base focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200'

export default function TaskDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session, managedProjects } = useAuth()
  const { byId } = useProfiles()
  const [task, setTask] = useState<Task | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  const uid = session!.user.id
  const dirty = task && draft ? JSON.stringify(draft) !== JSON.stringify(toDraft(task)) : false
  const dirtyRef = useRef(dirty) // để load() biết bản nháp đang được sửa
  dirtyRef.current = dirty

  const load = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle()
    if (error) setError('Không tải được công việc.')
    else if (!data) setError('Không tìm thấy công việc, hoặc bạn không còn được giao việc này.')
    const t = (data as Task) ?? null
    setTask(t)
    // Đang sửa dở thì không ghi đè bản nháp khi có cập nhật realtime.
    setDraft((prev) => (prev && dirtyRef.current ? prev : t ? toDraft(t) : null))
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
  if (!task || !draft)
    return (
      <div className="space-y-3">
        <ErrorBox message={error ?? 'Không tìm thấy công việc.'} onRetry={load} />
        <Link to="/tasks" className={btn.secondary}>
          ← Về danh sách
        </Link>
      </div>
    )

  const isManager = managedProjects.some((t) => t.id === task.project_id)
  const isAssignee = task.task_assignees.some((a) => a.user_id === uid)
  const canEditResult = isManager || isAssignee
  const actions = isManager || isAssignee ? nextStatuses(task.status, isManager) : []
  const overdue = task.due_at && task.status !== 'done' && new Date(task.due_at) < new Date()

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value })

  async function save() {
    if (!draft!.title.trim()) return setToast('Tiêu đề không được để trống.')
    setSaving(true)
    // Nhân viên chỉ được gửi cột result (database cũng chặn các cột khác).
    const fields = isManager
      ? {
          title: draft!.title.trim(),
          description: draft!.description.trim(),
          due_at: fromLocalInput(draft!.due),
          result: draft!.result.trim(),
        }
      : { result: draft!.result.trim() }
    const { data, error } = await supabase.from('tasks').update(fields).eq('id', task!.id).select(TASK_SELECT).single()
    setSaving(false)
    if (error) return setToast(error.message)
    setTask(data as Task)
    setDraft(toDraft(data as Task))
    setToast('Đã lưu.')
  }

  async function changeStatus(next: TaskStatus) {
    const prev = task!
    setTask({ ...prev, status: next })
    const err = await setTaskStatus(prev.id, next)
    if (err) {
      setTask(prev)
      setToast(err)
    }
  }

  async function remove() {
    if (!confirm('Xoá công việc này? Toàn bộ bình luận và ảnh liên quan cũng bị xoá.')) return
    const { error } = await supabase.from('tasks').delete().eq('id', task!.id)
    if (error) setToast(error.message)
    else navigate('/tasks', { replace: true })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/tasks" className="mb-3 inline-flex min-h-12 items-center text-sm text-indigo-700">
        ← Công việc
      </Link>

      <article className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-gray-200">
        <div className="flex items-start gap-2">
          {isManager ? (
            <input
              className="min-h-12 w-full min-w-0 flex-1 rounded-lg border border-transparent px-2 text-xl font-bold hover:border-gray-300 focus:border-indigo-600 focus:outline-none"
              aria-label="Tiêu đề"
              maxLength={200}
              value={draft.title}
              onChange={set('title')}
            />
          ) : (
            <h1 className="flex-1 break-words text-xl font-bold">{task.title}</h1>
          )}
          <span className="pt-3">
            <StatusBadge status={task.status} />
          </span>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-gray-500">Người làm</p>
          <AssigneeChips task={task} canEdit={isManager} profilesById={byId} onChanged={load} onError={setToast} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-medium text-gray-500">Hạn hoàn thành</p>
            {isManager ? (
              <input className={inputCls} type="datetime-local" aria-label="Hạn hoàn thành" value={draft.due} onChange={set('due')} />
            ) : (
              <p className={overdue ? 'font-semibold text-red-700' : ''}>
                {task.due_at ? formatDateTime(task.due_at) : '—'}
                {overdue && ' (quá hạn)'}
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-500">Người giao</p>
            <p className="flex min-h-12 items-center sm:min-h-0">{displayName(byId.get(task.created_by ?? ''))}</p>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-gray-500">Mô tả</p>
          {isManager ? (
            <textarea className={textareaCls} rows={3} maxLength={10000} aria-label="Mô tả" value={draft.description} onChange={set('description')} />
          ) : (
            <p className="whitespace-pre-wrap break-words">{task.description || '—'}</p>
          )}
        </div>

        <div>
          <p className="mb-1 text-sm font-medium text-gray-500">Kết quả</p>
          {canEditResult ? (
            <textarea
              className={textareaCls}
              rows={3}
              maxLength={4000}
              placeholder="Ghi kết quả thực hiện…"
              aria-label="Kết quả"
              value={draft.result}
              onChange={set('result')}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words">{task.result || '—'}</p>
          )}
        </div>

        {dirty && (
          <div className="flex gap-2">
            <button className={`${btn.secondary} flex-1`} onClick={() => setDraft(toDraft(task))} disabled={saving}>
              Huỷ thay đổi
            </button>
            <button className={`${btn.primary} flex-1`} onClick={save} disabled={saving}>
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        )}

        {actions.length > 0 && (
          <div className="grid grid-cols-2 gap-2 border-t border-gray-100 pt-4">
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
          <div className="border-t border-gray-100 pt-4">
            <button className={`${btn.danger} w-full`} onClick={remove}>
              Xoá công việc
            </button>
          </div>
        )}
      </article>

      {isManager && <StatusHistory taskId={task.id} version={task.updated_at} profilesById={byId} />}
      <Comments taskId={task.id} userId={uid} profilesById={byId} />
      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}
