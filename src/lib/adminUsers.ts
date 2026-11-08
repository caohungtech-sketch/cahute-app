import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Gọi Edge Function admin-users (xem docs/auth.md). Lỗi ném ra Error có thông báo tiếng Việt.
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error ?? 'Thao tác không thành công')
    }
    throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
  }
  return data as T
}

export interface NewStaff {
  full_name: string
  email: string
  phone: string
  hired_on: string | null
  project_ids: string[]
}

export const MIN_PASSWORD = 8

export const createStaff = (s: NewStaff) =>
  call<{ user_id: string; email: string; password: string }>({ action: 'create', ...s })

export const resetStaffPassword = (userId: string) =>
  call<{ password: string; signed_out: boolean }>({ action: 'reset_password', user_id: userId })

export const deactivateUser = (userId: string) => call<{ signed_out: boolean }>({ action: 'deactivate', user_id: userId })

// Đổi xong phải làm mới phiên để JWT mới không còn cờ must_change_password.
export async function changeOwnPassword(password: string) {
  await call<{ ok: true }>({ action: 'change_own_password', password })
  await supabase.auth.refreshSession()
}

// Kiểm tra mật khẩu mới ở giao diện; null = hợp lệ.
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) return `Mật khẩu phải có ít nhất ${MIN_PASSWORD} ký tự`
  if (password !== confirm) return 'Hai mật khẩu không khớp'
  return null
}
