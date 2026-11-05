import { useCallback, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorBox, Toast } from '../components/ui'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import type { Role } from '../lib/types'

// Quản lý nâng/hạ quyền tài khoản. Luật thật nằm ở trigger profiles_guard
// (không tự hạ quyền mình, luôn còn ít nhất 1 quản lý, dự án của người bị hạ chuyển cho người thực hiện).
export default function PermissionsPage() {
  const { session, profile, reload: reloadAuth } = useAuth()
  const { list: profiles, byId, reload: reloadProfiles } = useProfiles()
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  if (profile?.role !== 'manager') return <ErrorBox message="Chỉ quản lý mới dùng được trang này." />

  async function changeRole(userId: string, role: Role) {
    const name = displayName(byId.get(userId))
    const msg =
      role === 'manager'
        ? `Nâng ${name} lên quản lý? Người này sẽ tạo được dự án, giao việc và đổi quyền của người khác.`
        : `Hạ ${name} xuống nhân viên? Người này sẽ bị gỡ khỏi quản lý các dự án; bạn được thêm làm quản lý các dự án đó.`
    if (!confirm(msg)) return
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) setToast(error.message)
    else setToast(`Đã cập nhật quyền của ${name}. Người đó cần tải lại app để thấy thay đổi.`)
    await Promise.all([reloadProfiles(), reloadAuth()]) // dự án có thể vừa chuyển sang mình
  }

  const managerCount = profiles.filter((p) => p.role === 'manager').length

  return (
    <div className="mx-auto max-w-3xl space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-bold md:text-2xl">Phân quyền tài khoản</h1>
        <p className="text-sm text-gray-500">
          Quản lý tạo được dự án, giao việc và đổi quyền người khác. Không thể tự hạ quyền của mình; hệ thống luôn còn ít
          nhất một quản lý.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 md:px-5">
          <h2 className="flex-1 text-base font-semibold">Tài khoản</h2>
          <span className="text-sm text-gray-500">
            {profiles.length} người · {managerCount} quản lý
          </span>
        </div>
        <ul className="divide-y divide-gray-100">
          {profiles.map((p) => {
            const isSelf = p.id === session!.user.id
            return (
              <li key={p.id} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 md:px-5">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {displayName(p)}
                  {isSelf && <span className="font-normal text-gray-500"> (bạn)</span>}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    p.role === 'manager' ? 'bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {p.role === 'manager' ? 'Người quản lý dự án' : 'Nhân viên'}
                </span>
                {!isSelf &&
                  (p.role === 'staff' ? (
                    <button
                      className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium text-indigo-700 hover:bg-gray-100"
                      onClick={() => changeRole(p.id, 'manager')}
                    >
                      Nâng lên quản lý
                    </button>
                  ) : (
                    <button
                      className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium text-red-700 hover:bg-gray-100"
                      onClick={() => changeRole(p.id, 'staff')}
                    >
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
