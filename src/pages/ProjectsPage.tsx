import { Check, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorBox, inputCls, Toast } from '../components/ui'
import { displayName, useProfiles } from '../lib/profiles'
import { useProjectManagers, useProjectMembers } from '../lib/projects'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'

const greenBtn =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:opacity-50'
const plainBtn =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-100'
const iconBtn = 'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-gray-500 hover:bg-gray-100'

// Quản lý: tạo / đổi tên / xoá dự án, thêm/bớt nhân viên. Một nhân viên có thể thuộc nhiều dự án.
export default function ProjectsPage() {
  const { session, profile, managedProjects, reload: reloadAuth } = useAuth()
  const { list: profiles, byId } = useProfiles()
  const projectIds = managedProjects.map((t) => t.id)
  const { members, reload: reloadMembers } = useProjectMembers(projectIds)
  const { managers, reload: reloadManagers } = useProjectManagers(projectIds)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  if (profile?.role !== 'manager') return <ErrorBox message="Chỉ quản lý mới dùng được trang này." />

  const staff = profiles.filter((p) => p.role === 'staff' && !p.deleted_at)
  const managerAccounts = profiles.filter((p) => p.role === 'manager' && !p.deleted_at)
  const uid = session!.user.id

  async function createProject(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    // Trigger projects_after_insert tự thêm người tạo làm quản lý dự án
    const { error } = await supabase.from('projects').insert({ name: newName.trim() })
    setBusy(false)
    if (error) return setToast(error.message)
    setNewName('')
    setCreating(false)
    setToast('Đã tạo dự án.')
    await reloadAuth()
  }

  function startEdit(project: Project) {
    setEditingId(project.id)
    setEditName(project.name)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingId) return
    setBusy(true)
    const { error } = await supabase.from('projects').update({ name: editName.trim() }).eq('id', editingId)
    setBusy(false)
    if (error) return setToast(error.message)
    setEditingId(null)
    setToast('Đã đổi tên dự án.')
    await reloadAuth()
  }

  async function deleteProject(project: Project) {
    // Xoá dự án xoá luôn mọi công việc của dự án (on delete cascade) → báo rõ số việc
    const { count, error: countError } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
    if (countError) return setToast(countError.message)
    const msg =
      count
        ? `Xoá dự án "${project.name}"? ${count} công việc cùng bình luận và ảnh của chúng sẽ bị xoá vĩnh viễn.`
        : `Xoá dự án "${project.name}"?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    if (error) return setToast(error.message)
    setToast('Đã xoá dự án.')
    await reloadAuth()
  }

  async function addManager(projectId: string, userId: string) {
    const { error } = await supabase.from('project_managers').insert({ project_id: projectId, user_id: userId })
    if (error) setToast(error.message)
    await reloadManagers()
  }

  async function removeManager(project: Project, userId: string) {
    const msg =
      userId === uid
        ? `Rời vai trò quản lý dự án "${project.name}"? Bạn sẽ không còn xem và giao việc trong dự án này.`
        : `Gỡ ${displayName(byId.get(userId))} khỏi quản lý dự án "${project.name}"?`
    if (!confirm(msg)) return
    const { error } = await supabase.from('project_managers').delete().eq('project_id', project.id).eq('user_id', userId)
    if (error) return setToast(error.message)
    if (userId === uid) await reloadAuth()
    else await reloadManagers()
  }

  async function addMember(projectId: string, userId: string) {
    const { error } = await supabase.from('project_members').insert({ project_id: projectId, user_id: userId })
    if (error) setToast(error.message)
    await reloadMembers()
  }

  async function removeMember(projectId: string, userId: string) {
    if (!confirm('Gỡ nhân viên khỏi dự án? Họ cũng bị gỡ khỏi các việc chưa hoàn thành của dự án này.')) return
    const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
    if (error) setToast(error.message)
    await reloadMembers()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold md:text-2xl">Dự án</h1>
          <p className="text-sm text-gray-500">Tạo dự án và thêm nhân viên vào dự án để giao việc.</p>
        </div>
        {!creating && (
          <button className={greenBtn} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Tạo dự án
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={createProject} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5">
          <h2 className="mb-3 text-base font-semibold">Dự án mới</h2>
          <input
            className={inputCls}
            placeholder="Tên dự án, ví dụ: Lắp đặt điện tòa nhà A"
            required
            autoFocus
            maxLength={100}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className={plainBtn} onClick={() => setCreating(false)}>
              Huỷ
            </button>
            <button className={greenBtn} disabled={busy || !newName.trim()}>
              Tạo
            </button>
          </div>
        </form>
      )}

      {managedProjects.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200">
          <FolderPlus className="h-10 w-10 text-gray-400" aria-hidden />
          <p className="font-medium">Chưa có dự án nào</p>
          <p className="text-sm text-gray-500">Bấm "Tạo dự án" để bắt đầu.</p>
        </div>
      )}

      {managedProjects.map((project) => {
        const ids = members[project.id] ?? []
        const notInProject = staff.filter((p) => !ids.includes(p.id))
        const mgrIds = managers[project.id] ?? []
        const notManager = managerAccounts.filter((p) => !mgrIds.includes(p.id))
        const editing = editingId === project.id
        return (
          <section key={project.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5">
            {editing ? (
              <form onSubmit={saveEdit} className="mb-3 flex items-center gap-2">
                <input
                  className={inputCls}
                  required
                  autoFocus
                  maxLength={100}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Tên dự án"
                />
                <button
                  className={`${iconBtn} text-green-700`}
                  disabled={busy || !editName.trim() || editName.trim() === project.name}
                  aria-label="Lưu tên"
                  title="Lưu"
                >
                  <Check className="h-5 w-5" aria-hidden />
                </button>
                <button type="button" className={iconBtn} onClick={() => setEditingId(null)} aria-label="Huỷ sửa" title="Huỷ">
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </form>
            ) : (
              <div className="mb-3 flex items-center gap-2">
                <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{project.name}</h2>
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {ids.length} thành viên
                </span>
                <button className={iconBtn} onClick={() => startEdit(project)} aria-label={`Sửa tên ${project.name}`} title="Sửa tên">
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  className={`${iconBtn} hover:text-red-700`}
                  onClick={() => deleteProject(project)}
                  aria-label={`Xoá ${project.name}`}
                  title="Xoá dự án"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            )}

            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Quản lý</h3>
            <div className="flex flex-wrap items-center gap-2">
              {mgrIds.map((mid) => (
                <span
                  key={mid}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full bg-yellow-50 pl-3 text-sm font-medium text-yellow-800 ring-1 ring-yellow-200"
                >
                  {displayName(byId.get(mid))}
                  {mid === uid && <span className="font-normal">(bạn)</span>}
                  {mgrIds.length > 1 ? (
                    <button
                      className="grid h-9 w-9 place-items-center rounded-full hover:bg-yellow-100"
                      onClick={() => removeManager(project, mid)}
                      aria-label={`Gỡ ${displayName(byId.get(mid))} khỏi quản lý dự án`}
                      title="Gỡ khỏi quản lý"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  ) : (
                    <span className="w-3" />
                  )}
                </span>
              ))}
              {notManager.length > 0 && (
                <select
                  className="min-h-9 rounded-full border border-dashed border-gray-300 bg-white px-3 text-base text-gray-700 md:text-sm"
                  value=""
                  onChange={(e) => e.target.value && addManager(project.id, e.target.value)}
                  aria-label={`Thêm quản lý cho ${project.name}`}
                >
                  <option value="">+ Thêm quản lý…</option>
                  {notManager.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayName(p)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-500">Nhân viên</h3>
            {ids.length === 0 && <p className="text-sm text-gray-500">Chưa có thành viên.</p>}
            <ul className="divide-y divide-gray-100">
              {ids.map((uid) => (
                <li key={uid} className="flex min-h-12 items-center gap-2">
                  <span className="flex-1">{displayName(byId.get(uid))}</span>
                  <button className="min-h-12 px-3 text-sm text-red-700" onClick={() => removeMember(project.id, uid)}>
                    Gỡ khỏi dự án
                  </button>
                </li>
              ))}
            </ul>

            {notInProject.length > 0 && (
              <select
                className={`${inputCls} mt-3`}
                value=""
                onChange={(e) => e.target.value && addMember(project.id, e.target.value)}
                aria-label={`Thêm nhân viên vào ${project.name}`}
              >
                <option value="">+ Thêm nhân viên vào dự án…</option>
                {notInProject.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                  </option>
                ))}
              </select>
            )}
          </section>
        )
      })}

      <p className="text-xs text-gray-500">
        Nhân viên tự đăng ký tài khoản trên app, sau đó bạn thêm họ vào một hoặc nhiều dự án ở đây.
      </p>

      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}
