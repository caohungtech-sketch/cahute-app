-- =====================================================================
-- Cahute – Phần 18: quản lý tạo tài khoản nhân viên (xem docs/auth.md)
--   1. staff_emails(): email đăng nhập của mọi người – chỉ quản lý đọc được.
--   2. admin_revoke_sessions(): đăng xuất một người khỏi mọi thiết bị.
--      Chỉ service role (Edge Function admin-users) gọi được.
-- Không thêm bảng, không đổi RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Email của nhân viên (profiles không có email; auth.users không đọc trực tiếp được)
-- ---------------------------------------------------------------------
create function public.staff_emails()
returns table (user_id uuid, email text)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.email::text
  from auth.users u
  where public.is_manager();
$$;

revoke execute on function public.staff_emails() from public, anon;
grant execute on function public.staff_emails() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Đăng xuất khỏi mọi thiết bị: xoá phiên, refresh token bị xoá theo.
--    Access token đang dùng vẫn hợp lệ tới khi hết hạn (≤ 1 giờ).
-- ---------------------------------------------------------------------
create function public.admin_revoke_sessions(p_user_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = p_user_id;
end $$;

revoke execute on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;
