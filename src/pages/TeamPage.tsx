import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { btn, ErrorBox, inputCls, Toast } from '../components/ui'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'

// Quản lý: tạo nhóm, thêm/bớt nhân viên vào nhóm mình phụ trách.
export default function TeamPage() {
  const { session, profile, managedTeams, reload: reloadAuth } = useAuth()
  const { list: profiles, reload: reloadProfiles } = useProfiles()
  const [newTeam, setNewTeam] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  if (profile?.role !== 'manager') return <ErrorBox message="Chỉ quản lý mới dùng được trang này." />

  const unassigned = profiles.filter((p) => !p.team_id && p.role === 'staff')

  async function createTeam(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('teams').insert({ name: newTeam.trim(), manager_id: session!.user.id })
    setBusy(false)
    if (error) return setToast(error.message)
    setNewTeam('')
    await reloadAuth()
  }

  async function setTeam(userId: string, teamId: string | null) {
    const { error } = await supabase.from('profiles').update({ team_id: teamId }).eq('id', userId)
    if (error) setToast(error.message)
    await reloadProfiles()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-xl font-bold">Nhóm của tôi</h1>

      {managedTeams.map((team) => {
        const members = profiles.filter((p) => p.team_id === team.id && p.id !== team.manager_id)
        return (
          <section key={team.id} className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
            <h2 className="mb-2 font-semibold">
              {team.name} <span className="font-normal text-gray-500">({members.length} nhân viên)</span>
            </h2>
            {members.length === 0 && <p className="text-sm text-gray-500">Chưa có nhân viên.</p>}
            <ul className="divide-y divide-gray-100">
              {members.map((p) => (
                <li key={p.id} className="flex min-h-12 items-center gap-2">
                  <span className="flex-1">{displayName(p)}</span>
                  <button className="min-h-12 px-3 text-sm text-red-700" onClick={() => setTeam(p.id, null)}>
                    Gỡ khỏi nhóm
                  </button>
                </li>
              ))}
            </ul>

            {unassigned.length > 0 && (
              <select
                className={`${inputCls} mt-3`}
                value=""
                onChange={(e) => e.target.value && setTeam(e.target.value, team.id)}
                aria-label={`Thêm nhân viên vào ${team.name}`}
              >
                <option value="">+ Thêm nhân viên chưa có nhóm…</option>
                {unassigned.map((p) => (
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
        Nhân viên tự đăng ký tài khoản trên app, sau đó sẽ xuất hiện trong danh sách “chưa có nhóm” để bạn thêm vào.
      </p>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  )
}
