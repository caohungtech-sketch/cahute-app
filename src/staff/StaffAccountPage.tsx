import { Block, BlockTitle, Button, List, ListInput, ListItem, Navbar } from 'konsta/react'
import { useCallback, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { changeOwnPassword, MIN_PASSWORD, passwordProblem } from '../lib/adminUsers'
import { supabase } from '../lib/supabase'
import StaffToast from './StaffToast'

// Tài khoản của nhân viên (Konsta UI): xem email/vai trò, đổi họ tên, đổi mật khẩu, đăng xuất.
export default function StaffAccountPage() {
  const { session, profile, reload, signOut } = useAuth()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [changing, setChanging] = useState(false)

  const changed = name.trim() !== '' && name.trim() !== profile?.full_name

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile!.id)
    setSaving(false)
    if (error) return setToast(error.message)
    setToast('Đã lưu họ tên.')
    await reload()
  }

  async function changePassword() {
    const problem = passwordProblem(password, confirm)
    if (problem) return setToast(problem)
    setChanging(true)
    try {
      await changeOwnPassword(password)
      setPassword('')
      setConfirm('')
      setToast('Đã đổi mật khẩu.')
    } catch (err) {
      setToast((err as Error).message)
    }
    setChanging(false)
  }

  return (
    <>
      <Navbar title="Tài khoản" />

      <List strong inset dividers className="!mb-4 !mt-6">
        <ListItem title="Email" after={<span className="truncate">{session?.user.email}</span>} />
        <ListItem title="Vai trò" after={profile?.role === 'manager' ? 'Quản lý' : 'Nhân viên'} />
      </List>

      <BlockTitle>Họ và tên</BlockTitle>
      <List strong inset>
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

      <BlockTitle>Đổi mật khẩu</BlockTitle>
      <List strong inset>
        <ListInput
          type="password"
          placeholder={`Mật khẩu mới (tối thiểu ${MIN_PASSWORD} ký tự)`}
          value={password}
          maxLength={72}
          autoComplete="new-password"
          onChange={(e: { target: { value: string } }) => setPassword(e.target.value)}
          inputClassName="!text-base"
        />
        <ListInput
          type="password"
          placeholder="Nhập lại mật khẩu mới"
          value={confirm}
          autoComplete="new-password"
          onChange={(e: { target: { value: string } }) => setConfirm(e.target.value)}
          inputClassName="!text-base"
        />
      </List>
      <Block className="!my-3">
        <Button large rounded disabled={!password || !confirm || changing} onClick={changePassword}>
          {changing ? 'Đang lưu…' : 'Đổi mật khẩu'}
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
