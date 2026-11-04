import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { btn, ErrorBox, inputCls, Skeleton } from '../components/ui'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { useTeamMembers } from '../lib/teams'
import { fromLocalInput, toLocalInput } from '../lib/time'
import type { Task } from '../lib/types'

// Tạo mới (/tasks/new) hoặc sửa (/tasks/:id/edit) – chỉ dành cho quản lý.
export default function TaskFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session, managedTeams } = useAuth()
  const { list: profiles, reload: reloadProfiles } = useProfiles()
  const { members } = useTeamMembers(managedTeams.map((t) => t.id))

  const [loading, setLoading] = useState(Boolean(id))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [due, setDue] = useState('')
  const [teamId, setTeamId] = useState(managedTeams[0]?.id ?? '')
  const [assignees, setAssignees] = useState<string[]>([])
  const [original, setOriginal] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    reloadProfiles().catch(() => {}) // lấy danh sách thành viên nhóm mới nhất
    if (!id) return
    supabase
      .from('tasks')
      .select('id, team_id, title, description, due_at, task_assignees(user_id)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) setError('Không tải được công việc.')
        else {
          const t = data as Task
          setTitle(t.title)
          setDescription(t.description)
          setDue(toLocalInput(t.due_at))
          setTeamId(t.team_id)
          const ids = t.task_assignees.map((a) => a.user_id)
          setAssignees(ids)
          setOriginal(ids)
        }
        setLoading(false)
      })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps -- chỉ chạy khi đổi việc

  const memberIds = members[teamId] ?? []
  // Giữ cả người đang được giao nhưng đã rời nhóm để quản lý có thể bỏ chọn họ.
  const candidates = profiles.filter((p) => memberIds.includes(p.id) || original.includes(p.id))

  function toggle(uid: string) {
    setAssignees((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const fields = { title: title.trim(), description: description.trim(), due_at: fromLocalInput(due), team_id: teamId }
      let taskId = id
      if (id) {
        const { error } = await supabase.from('tasks').update(fields).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('tasks').insert({ ...fields, created_by: session!.user.id }).select('id').single()
        if (error) throw error
        taskId = data.id
      }

      // Chỉ thêm người mới (họ nhận thông báo) và gỡ người bị bỏ chọn.
      const added = assignees.filter((u) => !original.includes(u))
      const removed = original.filter((u) => !assignees.includes(u))
      if (removed.length) {
        const { error } = await supabase.from('task_assignees').delete().eq('task_id', taskId!).in('user_id', removed)
        if (error) throw error
      }
      if (added.length) {
        const { error } = await supabase.from('task_assignees').insert(added.map((u) => ({ task_id: taskId, user_id: u })))
        if (error) throw error
      }
      navigate(`/tasks/${taskId}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string }).message ?? 'Lưu thất bại.')
      setBusy(false)
    }
  }

  if (loading) return <Skeleton rows={2} />
  if (managedTeams.length === 0)
    return <ErrorBox message="Bạn cần quản lý ít nhất một nhóm để giao việc. Vào trang Nhóm để tạo nhóm." />

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={id ? `/tasks/${id}` : '/'} className="mb-3 inline-flex min-h-12 items-center text-sm text-blue-700">
        ← Quay lại
      </Link>
      <h1 className="mb-4 text-xl font-bold">{id ? 'Sửa công việc' : 'Tạo công việc'}</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Tiêu đề *</span>
          <input className={inputCls} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Mô tả</span>
          <textarea
            className="block min-h-32 w-full rounded-xl border border-gray-300 p-3 text-base focus:border-blue-600 focus:outline-none"
            maxLength={10000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Hạn hoàn thành</span>
          <input className={inputCls} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>

        {managedTeams.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Nhóm</span>
            <select
              className={inputCls}
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value)
                setAssignees([]) // người được giao phải thuộc nhóm mới
              }}
            >
              {managedTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset>
          <legend className="mb-1 text-sm font-medium">Giao cho ({assignees.length})</legend>
          {candidates.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nhóm chưa có nhân viên.{' '}
              <Link to="/team" className="text-blue-700 underline">
                Thêm nhân viên
              </Link>
            </p>
          ) : (
            <div className="divide-y divide-gray-100 rounded-xl bg-white ring-1 ring-gray-200">
              {candidates.map((p) => (
                <label key={p.id} className="flex min-h-12 items-center gap-3 px-3">
                  <input type="checkbox" className="h-5 w-5" checked={assignees.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span className="flex-1">{displayName(p)}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button className={`${btn.primary} w-full`} disabled={busy || !title.trim()}>
          {busy ? 'Đang lưu…' : id ? 'Lưu thay đổi' : 'Tạo và giao việc'}
        </button>
      </form>
    </div>
  )
}
