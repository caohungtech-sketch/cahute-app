import { useCallback, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { btn, ErrorBox, inputCls, Toast } from '../components/ui'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { useTeamMembers } from '../lib/teams'
import type { Role } from '../lib/types'

// Quản lý: tạo nhóm, thêm/bớt nhân viên. Một nhân viên có thể thuộc nhiều nhóm.
export default function TeamPage() {
  const { session, profile, managedTeams, reload: reloadAuth } = useAuth()
  const { list: profiles, byId, reload: reloadProfiles } = useProfiles()
  const { members, reload: reloadMembers } = useTeamMembers(managedTeams.map((t) => t.id))
  const [newTeam, setNewTeam] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  if (profile?.role !== 'manager') return <ErrorBox message="Chỉ quản lý mới dùng được trang này." />

  const staff = profiles.filter((p) => p.role === 'staff')

  async function createTeam(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('teams').insert({ name: newTeam.trim(), manager_id: session!.user.id })
    setBusy(false)
    if (error) return setToast(error.message)
    setNewTeam('')
    await reloadAuth()
  }

  async function addMember(teamId: string, userId: string) {
    const { error } = await supabase.from('team_members').insert({ team_id: teamId, user_id: userId })
    if (error) setToast(error.message)
    await reloadMembers()
  }

  async function removeMember(teamId: string, userId: string) {
    if (!confirm('Gỡ nhân viên khỏi nhóm? Họ cũng bị gỡ khỏi các việc chưa hoàn thành của nhóm này.')) return
    const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId)
    if (error) setToast(error.message)
    await reloadMembers()
  }

  async function changeRole(userId: string, role: Role) {
    const name = displayName(byId.get(userId))
    const msg =
      role === 'manager'
        ? `Nâng ${name} lên quản lý? Người này sẽ tạo được nhóm, giao việc và đổi quyền của người khác.`
        : `Hạ ${name} xuống nhân viên? Các nhóm người này đang quản lý sẽ chuyển sang cho bạn.`
    if (!confirm(msg)) return
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) setToast(error.message)
    else setToast(`Đã cập nhật quyền của ${name}. Người đó cần tải lại app để thấy thay đổi.`)
    await Promise.all([reloadProfiles(), reloadAuth()]) // nhóm có thể vừa chuyển sang mình
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Nhóm của tôi</h1>

      {managedTeams.map((team) => {
        const ids = members[team.id] ?? []
        const notInTeam = staff.filter((p) => !ids.includes(p.id))
        return (
          <section key={team.id} className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <h2 className="mb-2 font-semibold">
              {team.name} <span className="font-normal text-gray-500">({ids.length} thành viên)</span>
            </h2>
            {ids.length === 0 && <p className="text-sm text-gray-500">Chưa có thành viên.</p>}
            <ul className="divide-y divide-gray-100">
              {ids.map((uid) => (
                <li key={uid} className="flex min-h-12 items-center gap-2">
                  <span className="flex-1">{displayName(byId.get(uid))}</span>
                  <button className="min-h-12 px-3 text-sm text-red-700" onClick={() => removeMember(team.id, uid)}>
                    Gỡ khỏi nhóm
                  </button>
                </li>
              ))}
            </ul>

            {notInTeam.length > 0 && (
              <select
                className={`${inputCls} mt-3`}
                value=""
                onChange={(e) => e.target.value && addMember(team.id, e.target.value)}
                aria-label={`Thêm nhân viên vào ${team.name}`}
              >
                <option value="">+ Thêm nhân viên vào nhóm…</option>
                {notInTeam.map((p) => (
                  <option key={p.id} value={p.id}>
                    {displayName(p)}
                  </option>
                ))}
              </select>
            )}
          </section>
        )
      })}

      <form onSubmit={createTeam} className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
        <h2 className="mb-2 font-semibold">Tạo nhóm mới</h2>
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder="Tên nhóm, ví dụ: Đội kỹ thuật Q1"
            required
            maxLength={100}
            value={newTeam}
            onChange={(e) => setNewTeam(e.target.value)}
          />
          <button className={btn.primary} disabled={busy || !newTeam.trim()}>
            Tạo
          </button>
        </div>
      </form>

      <p className="text-xs text-gray-500">
        Nhân viên tự đăng ký tài khoản trên app, sau đó bạn thêm họ vào một hoặc nhiều nhóm ở đây.
      </p>

      <section className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
        <h2 className="mb-1 font-semibold">Phân quyền tài khoản</h2>
        <p className="mb-3 text-xs text-gray-500">
          Quản lý tạo được nhóm, giao việc và đổi quyền người khác. Không thể tự hạ quyền của mình; hệ thống luôn còn ít nhất
          một quản lý.
        </p>
        <ul className="divide-y divide-gray-100">
          {profiles.map((p) => {
            const isSelf = p.id === session!.user.id
            return (
              <li key={p.id} className="flex min-h-12 items-center gap-2 py-1">
                <span className="flex-1">
                  {displayName(p)}
                  {isSelf && <span className="text-gray-500"> (bạn)</span>}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.role === 'manager' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {p.role === 'manager' ? 'Quản lý' : 'Nhân viên'}
                </span>
                {!isSelf &&
                  (p.role === 'staff' ? (
                    <button className="min-h-12 px-2 text-sm font-medium text-blue-700" onClick={() => changeRole(p.id, 'manager')}>
                      Nâng lên quản lý
                    </button>
                  ) : (
                    <button className="min-h-12 px-2 text-sm font-medium text-red-700" onClick={() => changeRole(p.id, 'staff')}>
                      Hạ xuống nhân viên
                    </button>
                  ))}
              </li>
            )
          })}
        </ul>
      </section>

      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}
