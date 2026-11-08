import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { btn, inputCls } from '../components/ui'
import { changeOwnPassword, MIN_PASSWORD, passwordProblem } from '../lib/adminUsers'
import { supabase } from '../lib/supabase'

export default function AccountPage() {
  const { session, profile, reload, signOut } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id)
    if (error) return setError(error.message)
    setSaved(true)
    await reload()
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-bold">Tài khoản</h1>

      <div className="rounded-xl bg-white p-4 text-sm ring-1 ring-gray-200">
        <p className="text-gray-500">Email</p>
        <p className="font-medium">{session?.user.email}</p>
        <p className="mt-2 text-gray-500">Vai trò</p>
        <p className="font-medium">{profile?.role === 'manager' ? 'Quản lý' : 'Nhân viên'}</p>
      </div>

      <form onSubmit={save} className="rounded-xl bg-white p-4 ring-1 ring-gray-200">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Họ và tên</span>
          <input
            className={inputCls}
            required
            maxLength={100}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <button className={`${btn.primary} mt-3 w-full`} disabled={!name.trim() || name.trim() === profile?.full_name}>
          {saved ? 'Đã lưu ✓' : 'Lưu'}
        </button>
      </form>

      <ChangePasswordForm email={session?.user.email ?? ''} />

      <button className={`${btn.danger} w-full`} onClick={signOut}>
        Đăng xuất
      </button>
    </div>
  )
}

function ChangePasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const problem = passwordProblem(password, confirm)
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await changeOwnPassword(password)
      setPassword('')
      setConfirm('')
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-gray-200">
      <p className="text-sm font-medium">Đổi mật khẩu</p>
      <input type="email" autoComplete="username" value={email} readOnly hidden />
      <input
        className={inputCls}
        type="password"
        placeholder={`Mật khẩu mới (tối thiểu ${MIN_PASSWORD} ký tự)`}
        autoComplete="new-password"
        maxLength={72}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setDone(false)
        }}
      />
      <input
        className={inputCls}
        type="password"
        placeholder="Nhập lại mật khẩu mới"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className={`${btn.primary} w-full`} disabled={busy || !password || !confirm}>
        {busy ? 'Đang lưu…' : done ? 'Đã đổi mật khẩu ✓' : 'Đổi mật khẩu'}
      </button>
    </form>
  )
}
