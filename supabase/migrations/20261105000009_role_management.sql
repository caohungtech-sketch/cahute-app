-- =====================================================================
-- Cahute – Phần 9: quản lý nâng/hạ quyền tài khoản
--   - Chỉ quản lý được đổi vai trò (giữ nguyên)
--   - Không được tự hạ quyền chính mình; luôn còn ít nhất 1 quản lý
--   - Hạ quyền một quản lý → các nhóm của họ chuyển cho người thực hiện
--     (nếu không, họ vẫn điều khiển nhóm qua teams.manager_id)
-- =====================================================================

create or replace function public.profiles_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Không được đổi id';
  end if;

  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_manager() then
      raise exception 'Chỉ quản lý được đổi vai trò';
    end if;

    if old.role = 'manager' and new.role = 'staff' then
      if new.id = auth.uid() then
        raise exception 'Bạn không thể tự hạ quyền của chính mình';
      end if;
      if not exists (select 1 from public.profiles where role = 'manager' and id <> new.id) then
        raise exception 'Hệ thống phải còn ít nhất một quản lý';
      end if;

      if auth.uid() is not null then
        update public.teams set manager_id = auth.uid() where manager_id = new.id;
      elsif exists (select 1 from public.teams where manager_id = new.id) then
        -- Chạy từ SQL Editor: không biết chuyển nhóm cho ai
        raise exception 'Người này còn quản lý nhóm. Hãy chuyển các nhóm sang quản lý khác trước.';
      end if;
    end if;
  end if;

  return new;
end $$;
