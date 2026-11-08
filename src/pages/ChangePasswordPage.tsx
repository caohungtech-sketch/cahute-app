import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { btn, inputCls } from '../components/ui'
import { changeOwnPassword, MIN_PASSWORD, passwordProblem } from '../lib/adminUsers'

// Bắt buộc đổi mật khẩu tạm (lần đầu đăng nhập / sau khi quản lý đặt lại). Xem docs/auth.md.
export default function ChangePasswordPage() {
  const { session, signOut } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password, confirm)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await changeOwnPassword(password) // làm mới phiên → App tự vào trang chính
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/icons/icon-192.png" alt="" className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-bold">Đổi mật khẩu</h1>
          <p className="text-sm text-gray-500">
            Bạn đang dùng mật khẩu tạm do quản lý cấp. Hãy đặt mật khẩu mới để tiếp tục.
          </p>
          <p className="mt-1 text-sm font-medium text-gray-700">{session?.user.email}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {/* Giúp trình quản lý mật khẩu lưu đúng tài khoản */}
          <input type="email" autoComplete="username" value={session?.user.email ?? ''} readOnly hidden />
          <input
            className={inputCls}
            type="password"
            placeholder={`Mật khẩu mới (tối thiểu ${MIN_PASSWORD} ký tự)`}
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            maxLength={72}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            className={inputCls}
            type="password"
            placeholder="Nhập lại mật khẩu mới"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button className={`${btn.primary} w-full`} disabled={busy}>
            {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </button>
          <button type="button" className={`${btn.secondary} w-full`} onClick={signOut}>
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  )
}
