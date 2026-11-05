import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { btn, inputCls } from '../components/ui'

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message === 'Invalid login credentials' ? 'Sai email hoặc mật khẩu' : error.message)
      // Về trang chủ: route "/" đưa quản lý vào Tổng quan, nhân viên vào Tác vụ
      else navigate('/', { replace: true })
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
      })
      if (error) setError(error.message)
      else if (!data.session) setInfo('Đã đăng ký. Hãy mở email để xác nhận tài khoản rồi đăng nhập.')
      else navigate('/', { replace: true })
    }
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

        <div className="mb-4 grid grid-cols-2 rounded-xl bg-gray-200 p-1">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`min-h-11 rounded-lg text-sm font-medium ${mode === m ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              onClick={() => {
                setMode(m)
                setError(null)
                setInfo(null)
              }}
            >
              {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === 'signup' && (
            <input
              className={inputCls}
              placeholder="Họ và tên"
              autoComplete="name"
              required
              maxLength={100}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          )}
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
            placeholder="Mật khẩu (tối thiểu 6 ký tự)"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <p className="text-sm text-red-700">{error}</p>}
          {info && <p className="text-sm text-green-700">{info}</p>}

          <button className={`${btn.primary} w-full`} disabled={busy}>
            {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </form>
      </div>
    </div>
  )
}
