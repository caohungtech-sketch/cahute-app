import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { takeLoginNotice } from '../lib/adminUsers'
import { supabase } from '../lib/supabase'
import { btn, inputCls } from '../components/ui'

// Không có đăng ký: tài khoản do quản lý tạo ở trang Nhân viên (docs/auth.md).
export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice] = useState(takeLoginNotice) // ví dụ: vừa đổi mật khẩu

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      if (error.message === 'Invalid login credentials') setError('Sai email hoặc mật khẩu')
      else if (/banned/i.test(error.message)) setError('Tài khoản đã bị khoá. Liên hệ quản lý.')
      else setError(error.message)
    }
    // Về trang chủ: route "/" đưa quản lý vào Tổng quan, nhân viên vào Tác vụ
    else navigate('/', { replace: true })
    setBusy(false)
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <img src="/icons/icon-192.png" alt="" className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-bold">Cahute</h1>
          <p className="text-sm text-gray-500">Giao nhận việc cho đội hiện trường</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className={inputCls}
            type="email"
            placeholder="Email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={inputCls}
            type="password"
            placeholder="Mật khẩu"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {notice && !error && <p className="text-sm text-green-700">{notice}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}

          <button className={`${btn.primary} w-full`} disabled={busy}>
            {busy ? 'Đang xử lý…' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Chưa có tài khoản hoặc quên mật khẩu? Liên hệ quản lý để được cấp hoặc đặt lại.
        </p>
      </div>
    </div>
  )
}
