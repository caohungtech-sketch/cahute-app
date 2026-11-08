// Edge Function: quản lý tài khoản (xem docs/auth.md).
//   create              quản lý tạo nhân viên + mật khẩu tạm
//   reset_password      quản lý đặt lại mật khẩu nhân viên (+ đăng xuất mọi thiết bị)
//   deactivate          quản lý xoá nhân viên = ẩn + khoá đăng nhập
//   change_own_password người đăng nhập tự đổi mật khẩu (tắt cờ must_change_password)
// Deploy: npx supabase functions deploy admin-users   (giữ kiểm tra JWT mặc định)
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY do Supabase tự cung cấp. Không log mật khẩu.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const BAN_FOREVER = '876000h' // ~100 năm
const MIN_PASSWORD = 8
// Bỏ ký tự dễ nhầm khi đọc/gõ: 0 O o 1 l I
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// Luôn có chữ thường, chữ hoa và số (phòng khi Supabase bật yêu cầu độ mạnh mật khẩu)
function tempPassword(length = 8): string {
  for (;;) {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    const p = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
    if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p)) return p
  }
}

async function requireManager(admin: SupabaseClient, uid: string) {
  const { data, error } = await admin.from('profiles').select('role, deleted_at').eq('id', uid).single()
  if (error || !data || data.role !== 'manager' || data.deleted_at) {
    throw new HttpError(403, 'Chỉ quản lý mới làm được việc này')
  }
}

async function getTarget(admin: SupabaseClient, userId: unknown) {
  if (typeof userId !== 'string' || !userId) throw new HttpError(400, 'Thiếu người cần thao tác')
  const { data, error } = await admin.from('profiles').select('id, role, deleted_at').eq('id', userId).single()
  if (error || !data) throw new HttpError(404, 'Không tìm thấy nhân viên')
  return data as { id: string; role: string; deleted_at: string | null }
}

// Đăng xuất mọi thiết bị. Lỗi ở bước này không làm hỏng thao tác chính, chỉ báo lại.
async function revokeSessions(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await admin.rpc('admin_revoke_sessions', { p_user_id: userId })
  if (error) console.error('admin_revoke_sessions', error.message)
  return !error
}

async function create(admin: SupabaseClient, caller: string, body: Record<string, unknown>) {
  await requireManager(admin, caller)

  const fullName = String(body.full_name ?? '').trim().slice(0, 100)
  const email = String(body.email ?? '').trim().toLowerCase()
  const phone = String(body.phone ?? '').trim().slice(0, 20)
  const hiredOn = typeof body.hired_on === 'string' && body.hired_on ? body.hired_on : null
  const projectIds = Array.isArray(body.project_ids) ? [...new Set(body.project_ids.map(String))] : []

  if (!fullName) throw new HttpError(400, 'Hãy nhập họ tên')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email không hợp lệ')

  // Chỉ thêm vào dự án mà người gọi đang quản lý
  if (projectIds.length > 0) {
    const { data, error } = await admin
      .from('project_managers')
      .select('project_id')
      .eq('user_id', caller)
      .in('project_id', projectIds)
    if (error) throw error
    if ((data ?? []).length !== projectIds.length) throw new HttpError(403, 'Bạn chỉ thêm được nhân viên vào dự án mình quản lý')
  }

  const password = tempPassword()
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { must_change_password: true },
  })
  if (createError || !created.user) {
    const msg = createError?.message ?? ''
    if (/already|registered|exists/i.test(msg)) throw new HttpError(409, 'Email này đã có tài khoản')
    throw new Error(msg || 'Không tạo được tài khoản')
  }
  const userId = created.user.id

  try {
    // Hồ sơ (profiles, role staff) do trigger handle_new_user tạo. Ghi đè tên cho chắc.
    const { error: pErr } = await admin.from('profiles').update({ full_name: fullName }).eq('id', userId)
    if (pErr) throw pErr

    if (phone || hiredOn) {
      const { error } = await admin.from('staff_details').upsert({ user_id: userId, phone, hired_on: hiredOn })
      if (error) throw error
    }

    if (projectIds.length > 0) {
      const { error } = await admin
        .from('project_members')
        .insert(projectIds.map((project_id) => ({ project_id, user_id: userId })))
      if (error) throw error
    }
  } catch (e) {
    // Không để lại tài khoản dở dang
    await admin.auth.admin.deleteUser(userId)
    throw e
  }

  return { user_id: userId, email, password }
}

async function resetPassword(admin: SupabaseClient, caller: string, body: Record<string, unknown>) {
  await requireManager(admin, caller)
  const target = await getTarget(admin, body.user_id)
  if (target.role !== 'staff') throw new HttpError(403, 'Chỉ đặt lại được mật khẩu của nhân viên')
  if (target.deleted_at) throw new HttpError(400, 'Nhân viên này đã bị xoá')

  const password = tempPassword()
  const { error } = await admin.auth.admin.updateUserById(target.id, {
    password,
    app_metadata: { must_change_password: true },
  })
  if (error) throw error

  const signedOut = await revokeSessions(admin, target.id)
  return { password, signed_out: signedOut }
}

async function deactivate(admin: SupabaseClient, caller: string, body: Record<string, unknown>) {
  await requireManager(admin, caller)
  const target = await getTarget(admin, body.user_id)
  if (target.id === caller) throw new HttpError(400, 'Bạn không thể tự xoá chính mình')

  const { error: banError } = await admin.auth.admin.updateUserById(target.id, { ban_duration: BAN_FOREVER })
  if (banError) throw banError

  if (!target.deleted_at) {
    const { error } = await admin.from('profiles').update({ deleted_at: new Date().toISOString() }).eq('id', target.id)
    if (error) throw error
  }

  const signedOut = await revokeSessions(admin, target.id)
  return { signed_out: signedOut }
}

async function changeOwnPassword(admin: SupabaseClient, caller: string, body: Record<string, unknown>) {
  const password = String(body.password ?? '')
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự`)
  if (password.length > 72) throw new HttpError(400, 'Mật khẩu quá dài (tối đa 72 ký tự)')

  const { error } = await admin.auth.admin.updateUserById(caller, {
    password,
    app_metadata: { must_change_password: false },
  })
  if (error) throw error
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await admin.auth.getUser(jwt)
    if (authError || !auth.user) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn, hãy đăng nhập lại')
    const caller = auth.user.id

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    switch (body.action) {
      case 'create':
        return json(await create(admin, caller, body))
      case 'reset_password':
        return json(await resetPassword(admin, caller, body))
      case 'deactivate':
        return json(await deactivate(admin, caller, body))
      case 'change_own_password':
        return json(await changeOwnPassword(admin, caller, body))
      default:
        throw new HttpError(400, 'Thao tác không hợp lệ')
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error('admin-users', e instanceof Error ? e.message : e)
    return json({ error: 'Lỗi máy chủ, hãy thử lại' }, 500)
  }
})
