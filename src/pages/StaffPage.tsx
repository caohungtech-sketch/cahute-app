import { Copy, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import ResponsiveDialog from '../components/ResponsiveDialog'
import { Button } from '../components/shadcn/button'
import { ErrorBox, inputCls, Skeleton, Toast } from '../components/ui'
import { createStaff, deactivateUser, resetStaffPassword } from '../lib/adminUsers'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { formatDateOnly } from '../lib/time'
import type { Profile, Role, StaffDetails } from '../lib/types'

type Link = { project_id: string; user_id: string }

const EMPTY_DETAILS: Omit<StaffDetails, 'user_id'> = {
  phone: '',
  hired_on: null,
}

const iconBtn = 'grid h-11 w-11 shrink-0 place-items-center rounded-xl text-gray-500 hover:bg-gray-100'

// Danh sách nhân viên: thông tin nhân sự, vai trò, dự án. Thay cho trang Phân quyền cũ.
export default function StaffPage() {
  const { session, profile, reload: reloadAuth } = useAuth()
  const { list: profiles, byId, reload: reloadProfiles } = useProfiles()
  const [details, setDetails] = useState<Map<string, StaffDetails>>(new Map())
  const [members, setMembers] = useState<Link[]>([])
  const [managers, setManagers] = useState<Link[]>([])
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [emails, setEmails] = useState<Map<string, string>>(new Map())
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)
  const [credentials, setCredentials] = useState<Credentials | null>(null) // mật khẩu tạm vừa tạo/đặt lại
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  const load = useCallback(async () => {
    setError(null)
    const [d, m, pm, p, e] = await Promise.all([
      supabase.from('staff_details').select('user_id, phone, hired_on'),
      supabase.from('project_members').select('project_id, user_id'),
      supabase.from('project_managers').select('project_id, user_id'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.rpc('staff_emails'),
    ])
    const err = d.error ?? m.error ?? pm.error ?? p.error ?? e.error
    if (err) return setError('Không tải được danh sách nhân viên. Kiểm tra kết nối mạng.')
    setDetails(new Map((d.data as StaffDetails[]).map((r) => [r.user_id, r])))
    setEmails(new Map((e.data as { user_id: string; email: string }[]).map((r) => [r.user_id, r.email])))
    setMembers(m.data ?? [])
    setManagers(pm.data ?? [])
    setProjectNames(new Map((p.data ?? []).map((r) => [r.id, r.name])))
    setLoaded(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const visible = useMemo(() => profiles.filter((p) => !p.deleted_at), [profiles])

  if (profile?.role !== 'manager') return <ErrorBox message="Chỉ quản lý mới dùng được trang này." />

  const uid = session!.user.id
  const managerCount = visible.filter((p) => p.role === 'manager').length

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
    await Promise.all([reloadProfiles(), reloadAuth(), load()]) // dự án có thể vừa chuyển sang mình
  }

  async function hide(p: Profile) {
    if (
      !confirm(
        `Xoá ${displayName(p)}? Người này sẽ bị khoá đăng nhập và đăng xuất khỏi mọi thiết bị. Công việc, bình luận cũ vẫn được giữ.`,
      )
    )
      return
    try {
      await deactivateUser(p.id)
      setToast(`Đã xoá và khoá đăng nhập của ${displayName(p)}.`)
    } catch (err) {
      return setToast((err as Error).message)
    }
    await reloadProfiles()
  }

  async function resetPassword(p: Profile) {
    if (!confirm(`Đặt lại mật khẩu cho ${displayName(p)}? Người này sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập bằng mật khẩu tạm mới.`))
      return
    try {
      const r = await resetStaffPassword(p.id)
      setCredentials({ title: 'Đã đặt lại mật khẩu', name: displayName(p), email: emails.get(p.id) ?? '', password: r.password })
      if (!r.signed_out) setToast('Chưa đăng xuất được các thiết bị khác của người này. Mật khẩu cũ vẫn đã hết hiệu lực.')
    } catch (err) {
      setToast((err as Error).message)
    }
  }

  // Dự án của một người (chỉ xem): nhân viên → dự án tham gia; quản lý → dự án đang quản lý.
  // Thêm/gỡ nhân viên khỏi dự án làm ở trang Dự án.
  function projectChips(p: Profile) {
    const isMgr = p.role === 'manager'
    const ids = (isMgr ? managers : members).filter((l) => l.user_id === p.id).map((l) => l.project_id)
    if (ids.length === 0) return <span className="text-sm text-gray-500">—</span>
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {ids.map((pid) => (
          <span
            key={pid}
            className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-medium ${
              isMgr ? 'bg-indigo-50 text-indigo-800' : 'bg-gray-100 text-gray-700'
            }`}
            title={isMgr ? 'Đang quản lý dự án này' : undefined}
          >
            {projectNames.get(pid) ?? '…'}
          </span>
        ))}
      </div>
    )
  }

  // Tên bấm được để mở hộp thoại sửa thông tin
  function nameButton(p: Profile) {
    return (
      <button
        className="text-left font-semibold text-gray-900 hover:text-indigo-700 hover:underline"
        onClick={() => setEditing(p)}
        title="Sửa thông tin"
      >
        {displayName(p)}
        {p.id === uid && <span className="font-normal text-gray-500"> (bạn)</span>}
      </button>
    )
  }

  function roleCell(p: Profile) {
    const isSelf = p.id === uid
    return (
      <div className="flex flex-col items-start gap-1">
        <span
          className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
            p.role === 'manager' ? 'bg-yellow-50 text-yellow-800 ring-1 ring-yellow-200' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {p.role === 'manager' ? 'Người quản lý dự án' : 'Nhân viên'}
        </span>
        {!isSelf && (
          <button
            className={`whitespace-nowrap text-xs font-medium hover:underline ${p.role === 'staff' ? 'text-indigo-700' : 'text-red-700'}`}
            onClick={() => changeRole(p.id, p.role === 'staff' ? 'manager' : 'staff')}
          >
            {p.role === 'staff' ? 'Nâng lên quản lý' : 'Hạ xuống nhân viên'}
          </button>
        )}
      </div>
    )
  }

  function actions(p: Profile) {
    return (
      <div className="flex justify-end">
        <button className={iconBtn} onClick={() => setEditing(p)} aria-label={`Sửa thông tin ${displayName(p)}`} title="Sửa thông tin">
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        {p.role === 'staff' && (
          <button
            className={iconBtn}
            onClick={() => resetPassword(p)}
            aria-label={`Đặt lại mật khẩu ${displayName(p)}`}
            title="Đặt lại mật khẩu"
          >
            <KeyRound className="h-4 w-4" aria-hidden />
          </button>
        )}
        {p.id !== uid && (
          <button
            className={`${iconBtn} hover:text-red-700`}
            onClick={() => hide(p)}
            aria-label={`Xoá ${displayName(p)}`}
            title="Xoá khỏi danh sách"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold md:text-2xl">Nhân viên</h1>
          <p className="text-sm text-gray-500">
            {visible.length} người · {managerCount} quản lý. Bấm vào tên để sửa thông tin. Thêm nhân viên vào dự án ở trang Dự án.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Thêm nhân viên
        </Button>
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {!error && !loaded && <Skeleton rows={4} />}

      {loaded && !error && (
        <>
          {/* Desktop: bảng */}
          <section className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 md:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Họ tên</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Số điện thoại</th>
                  <th className="px-3 py-3 font-medium">Ngày vào làm</th>
                  <th className="px-3 py-3 font-medium">Vai trò</th>
                  <th className="px-3 py-3 font-medium">Dự án</th>
                  <th className="px-3 py-3" aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((p) => {
                  const d = details.get(p.id)
                  return (
                    <tr key={p.id} className="align-top hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3">{nameButton(p)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{emails.get(p.id)}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{d?.phone}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatDateOnly(d?.hired_on ?? null)}</td>
                      <td className="px-3 py-3">
                        {roleCell(p)}
                      </td>
                      <td className="px-3 py-3">
                        {projectChips(p)}
                      </td>
                      <td className="px-2 py-1">
                        {actions(p)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          {/* Điện thoại: thẻ */}
          <ul className="space-y-3 md:hidden">
            {visible.map((p) => {
              const d = details.get(p.id)
              const rows: [string, string][] = [
                ['Email', emails.get(p.id) ?? ''],
                ['SĐT', d?.phone ?? ''],
                ['Ngày vào làm', formatDateOnly(d?.hired_on ?? null)],
              ]
              return (
                <li key={p.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words">{nameButton(p)}</p>
                      <div className="mt-1">
                        {roleCell(p)}
                      </div>
                    </div>
                    {actions(p)}
                  </div>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    {rows.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-gray-500">{k}</dt>
                        <dd className="min-w-0 break-words">{v || <span className="text-gray-400">—</span>}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Dự án</p>
                    {projectChips(p)}
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {editing && (
        <EditDialog
          person={editing}
          details={details.get(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null)
            setToast(msg)
            await Promise.all([reloadProfiles(), load()])
          }}
          onError={setToast}
        />
      )}

      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={async (c) => {
            setCreating(false)
            setCredentials(c)
            await Promise.all([reloadProfiles(), load()])
          }}
        />
      )}

      {credentials && <CredentialsDialog credentials={credentials} onClose={() => setCredentials(null)} />}

      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}

interface Credentials {
  title: string
  name: string
  email: string
  password: string
}

const fieldLabel = 'mb-1 block text-sm font-medium'

// Quản lý tạo tài khoản nhân viên; server sinh mật khẩu tạm (docs/auth.md).
function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Credentials) => void }) {
  const { managedProjects } = useAuth()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', hired_on: '' })
  const [projectIds, setProjectIds] = useState<string[]>(managedProjects.length === 1 ? [managedProjects[0].id] : [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function toggleProject(id: string) {
    setProjectIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = await createStaff({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        hired_on: form.hired_on || null,
        project_ids: projectIds,
      })
      onCreated({ title: 'Đã tạo tài khoản', name: form.full_name.trim(), email: r.email, password: r.password })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog open onClose={onClose} title="Thêm nhân viên">
      <form onSubmit={submit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={fieldLabel}>Họ tên *</span>
            <input className={inputCls} required maxLength={100} autoComplete="off" value={form.full_name} onChange={set('full_name')} />
          </label>
          <label className="sm:col-span-2">
            <span className={fieldLabel}>Email đăng nhập *</span>
            <input className={inputCls} type="email" required autoComplete="off" value={form.email} onChange={set('email')} />
          </label>
          <label>
            <span className={fieldLabel}>Số điện thoại</span>
            <input className={inputCls} type="tel" inputMode="tel" maxLength={20} value={form.phone} onChange={set('phone')} />
          </label>
          <label>
            <span className={fieldLabel}>Ngày vào làm</span>
            <input className={inputCls} type="date" value={form.hired_on} onChange={set('hired_on')} />
          </label>
        </div>

        {managedProjects.length > 0 && (
          <fieldset className="mt-4">
            <legend className={fieldLabel}>Thêm vào dự án</legend>
            <div className="flex flex-wrap gap-2">
              {managedProjects.map((pr) => {
                const on = projectIds.includes(pr.id)
                return (
                  <button
                    key={pr.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleProject(pr.id)}
                    className={`min-h-10 rounded-full px-3 text-sm font-medium ring-1 ${
                      on ? 'bg-indigo-50 text-indigo-800 ring-indigo-300' : 'bg-white text-gray-700 ring-gray-300'
                    }`}
                  >
                    {on ? '✓ ' : ''}
                    {pr.name}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}

        <p className="mt-4 text-sm text-gray-500">
          Hệ thống tự tạo mật khẩu tạm. Nhân viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.
        </p>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" disabled={busy || !form.full_name.trim() || !form.email.trim()}>
            {busy ? 'Đang tạo…' : 'Tạo tài khoản'}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  )
}

// Hiện mật khẩu tạm MỘT LẦN để quản lý gửi cho nhân viên (Zalo…).
function CredentialsDialog({ credentials: c, onClose }: { credentials: Credentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const text = `Đăng nhập Cahute tại ${window.location.origin}\nEmail: ${c.email}\nMật khẩu tạm: ${c.password}\n(Đổi mật khẩu ở lần đăng nhập đầu tiên)`

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
      alert(text) // trình duyệt chặn clipboard: hiện để chép tay
    }
  }

  return (
    <ResponsiveDialog open onClose={onClose} title={c.title}>
      <p className="text-sm text-gray-600">
        Gửi thông tin sau cho <span className="font-semibold text-gray-900">{c.name}</span>. Mật khẩu chỉ hiện một lần; đóng hộp thoại
        là không xem lại được (quên thì đặt lại).
      </p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-xl bg-gray-50 p-4 text-sm ring-1 ring-gray-200">
        <dt className="text-gray-500">Email</dt>
        <dd className="min-w-0 break-all font-medium">{c.email}</dd>
        <dt className="text-gray-500">Mật khẩu tạm</dt>
        <dd className="font-mono text-base font-semibold tracking-wider">{c.password}</dd>
      </dl>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Đóng
        </Button>
        <Button type="button" onClick={copy}>
          <Copy className="h-4 w-4" aria-hidden />
          {copied ? 'Đã sao chép ✓' : 'Sao chép'}
        </Button>
      </div>
    </ResponsiveDialog>
  )
}

function EditDialog({
  person,
  details,
  onClose,
  onSaved,
  onError,
}: {
  person: Profile
  details: StaffDetails | undefined
  onClose: () => void
  onSaved: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [fullName, setFullName] = useState(person.full_name)
  const [form, setForm] = useState({ ...EMPTY_DETAILS, ...details })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof EMPTY_DETAILS) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    if (fullName.trim() !== person.full_name) {
      const { error } = await supabase.from('profiles').update({ full_name: fullName.trim() }).eq('id', person.id)
      if (error) {
        setBusy(false)
        return onError(error.message)
      }
    }
    const { error } = await supabase.from('staff_details').upsert({
      user_id: person.id,
      phone: form.phone.trim(),
      hired_on: form.hired_on || null,
    })
    setBusy(false)
    if (error) return onError(error.message)
    onSaved(`Đã lưu thông tin của ${fullName.trim() || 'nhân viên'}.`)
  }

  const label = 'mb-1 block text-sm font-medium'

  return (
    <ResponsiveDialog open onClose={onClose} title="Thông tin nhân viên">
      <form onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={label}>Họ tên</span>
            <input className={inputCls} required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>
            <span className={label}>Số điện thoại</span>
            <input className={inputCls} type="tel" inputMode="tel" maxLength={20} value={form.phone} onChange={set('phone')} />
          </label>
          <label>
            <span className={label}>Ngày vào làm</span>
            <input className={inputCls} type="date" value={form.hired_on ?? ''} onChange={set('hired_on')} />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="submit" disabled={busy || !fullName.trim()}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </div>
      </form>
    </ResponsiveDialog>
  )
}
