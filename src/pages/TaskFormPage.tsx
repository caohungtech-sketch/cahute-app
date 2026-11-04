import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { btn, ErrorBox, inputCls } from '../components/ui'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { useTeamMembers } from '../lib/teams'
import { fromLocalInput } from '../lib/time'

// Tạo công việc mới (chỉ quản lý). Sửa nội dung làm trực tiếp ở trang chi tiết.
export default function TaskFormPage() {
  const navigate = useNavigate()
  const { session, managedTeams } = useAuth()
  const { byId } = useProfiles()
  const { members } = useTeamMembers(managedTeams.map((t) => t.id))

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [due, setDue] = useState('')
  const [teamId, setTeamId] = useState(managedTeams[0]?.id ?? '')
  const [assignees, setAssignees] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const memberIds = members[teamId] ?? []

  function toggle(uid: string) {
    setAssignees((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        team_id: teamId,
        title: title.trim(),
        description: description.trim(),
        due_at: fromLocalInput(due),
        created_by: session!.user.id,
      })
      .select('id')
      .single()
    if (error) {
      setError(error.message)
      return setBusy(false)
    }
    if (assignees.length) {
      const { error: aErr } = await supabase.from('task_assignees').insert(assignees.map((u) => ({ task_id: data.id, user_id: u })))
      if (aErr) setError(`Đã tạo việc nhưng giao người thất bại: ${aErr.message}`)
    }
    navigate(`/tasks/${data.id}`, { replace: true })
  }

  if (managedTeams.length === 0)
    return <ErrorBox message="Bạn cần quản lý ít nhất một nhóm để giao việc. Vào trang Nhóm để tạo nhóm." />

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="mb-3 inline-flex min-h-12 items-center text-sm text-blue-700">
        ← Quay lại
      </Link>
      <h1 className="mb-4 text-xl font-bold">Tạo công việc</h1>

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Tiêu đề *</span>
          <input className={inputCls} required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">Mô tả</span>
          <textarea
            className="block w-full resize-y rounded-xl border border-gray-300 bg-white p-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            rows={3}
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
          <legend className="mb-1 text-sm font-medium">Giao cho</legend>
          {memberIds.length === 0 ? (
            <p className="text-sm text-gray-500">
              Nhóm chưa có thành viên.{' '}
              <Link to="/team" className="text-blue-700 underline">
                Thêm nhân viên
              </Link>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {memberIds.map((id) => {
                const on = assignees.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    className={`min-h-10 rounded-full px-3 text-sm ring-1 ${
                      on ? 'bg-blue-700 text-white ring-blue-700' : 'bg-white text-gray-700 ring-gray-300'
                    }`}
                    onClick={() => toggle(id)}
                  >
                    {on && '✓ '}
                    {displayName(byId.get(id))}
                  </button>
                )
              })}
            </div>
          )}
        </fieldset>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button className={`${btn.primary} w-full`} disabled={busy || !title.trim()}>
          {busy ? 'Đang lưu…' : 'Tạo và giao việc'}
        </button>
      </form>
    </div>
  )
}
