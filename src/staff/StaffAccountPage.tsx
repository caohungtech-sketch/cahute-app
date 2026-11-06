import { Block, BlockTitle, Button, List, ListInput, ListItem, Navbar } from 'konsta/react'
import { useCallback, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import StaffToast from './StaffToast'

// Tài khoản của nhân viên (Konsta UI): xem email/vai trò, đổi họ tên, đăng xuất.
export default function StaffAccountPage() {
  const { session, profile, reload, signOut } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  const changed = name.trim() !== '' && name.trim() !== profile?.full_name

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id)
    setSaving(false)
    if (error) return setToast(error.message)
    setToast('Đã lưu họ tên.')
    await reload()
  }

  return (
    <>
      <Navbar title="Tài khoản" />

      <List strong inset dividers className="!my-4">
        <ListItem title="Email" after={<span className="truncate">{session?.user.email}</span>} />
        <ListItem title="Vai trò" after={profile?.role === 'manager' ? 'Quản lý' : 'Nhân viên'} />
      </List>

      <BlockTitle>Họ và tên</BlockTitle>
      <List strong inset className="!my-2">
        <ListInput
          type="text"
          placeholder="Nhập họ và tên"
          value={name}
          maxLength={100}
          autoComplete="name"
          onChange={(e: { target: { value: string } }) => setName(e.target.value)}
          inputClassName="!text-base"
        />
      </List>
      <Block className="!my-3">
        <Button large rounded disabled={!changed || saving} onClick={save}>
          {saving ? 'Đang lưu…' : 'Lưu'}
        </Button>
      </Block>

      <Block className="!my-6">
        <Button large rounded tonal colors={{ tonalTextIos: 'text-red-600', tonalBgIos: 'bg-red-500/15 active:bg-red-500/25' }} onClick={signOut}>
          Đăng xuất
        </Button>
      </Block>

      <StaffToast message={toast} onClose={closeToast} />
    </>
  )
}
