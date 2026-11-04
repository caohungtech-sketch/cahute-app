-- =====================================================================
-- Cahute – Phần 6: quyền thực thi hàm, quyền theo cột, Realtime
-- =====================================================================

-- Hàm: không cho anon gọi; người đăng nhập gọi được hàm phân quyền/RPC.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- ingest_location chỉ dành cho Edge Function (service role).
revoke execute on function public.ingest_location(text, timestamptz, double precision, double precision, real, real, real, real)
  from authenticated;

-- Bảng: anon không có quyền gì; RLS lo phần còn lại cho authenticated.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;

-- Quyền theo cột: người dùng chỉ được sửa đúng cột cần thiết.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke update on public.conversation_members from authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

revoke insert, update, delete on public.locations, public.last_locations, public.telegram_link_tokens from authenticated;
revoke insert, update on public.telegram_links from authenticated;
revoke select on public.telegram_link_tokens from authenticated;

-- Realtime (vẫn tuân theo RLS)
alter publication supabase_realtime add table
  public.tasks,
  public.task_assignees,
  public.task_comments,
  public.messages,
  public.notifications,
  public.last_locations;
