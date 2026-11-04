import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { btn, inputCls } from '../components/ui'
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

      <button className={`${btn.danger} w-full`} onClick={signOut}>
        Đăng xuất
      </button>
    </div>
  )
}
