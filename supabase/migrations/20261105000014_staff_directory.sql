-- =====================================================================
-- Cahute – Phần 14: trang Nhân viên
--   1. staff_details: SĐT, CCCD, ngày cấp, nơi cấp, ngày vào làm
--      Bảng riêng vì profiles ai đăng nhập cũng đọc được (để hiện tên).
--      Quản lý xem/sửa của mọi người; nhân viên chỉ xem của chính mình.
--   2. profiles.deleted_at: "Xoá" nhân viên = ẩn khỏi danh sách, dữ liệu vẫn giữ.
--   3. Quản lý xem được mọi thành viên/quản lý của mọi dự án (để hiện cột Dự án).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. staff_details
-- ---------------------------------------------------------------------
create table public.staff_details (
  user_id         uuid primary key references public.profiles (id) on delete cascade,
  phone           text not null default '' check (length(phone) <= 20),
  id_number       text not null default '' check (length(id_number) <= 20),
  id_issued_on    date,
  id_issued_place text not null default '' check (length(id_issued_place) <= 200),
  hired_on        date,
  updated_at      timestamptz not null default now()
);

create function public.staff_details_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger staff_details_before_write
  before insert or update on public.staff_details
  for each row execute function public.staff_details_before_write();

alter table public.staff_details enable row level security;

create policy staff_details_select on public.staff_details for select to authenticated
  using (user_id = auth.uid() or public.is_manager());
create policy staff_details_insert on public.staff_details for insert to authenticated
  with check (public.is_manager());
create policy staff_details_update on public.staff_details for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------------
-- 2. Ẩn nhân viên (xoá mềm)
-- ---------------------------------------------------------------------
alter table public.profiles add column deleted_at timestamptz;

create or replace function public.profiles_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Không được đổi id';
  end if;

  if new.deleted_at is distinct from old.deleted_at and auth.uid() is not null then
    if not public.is_manager() then
      raise exception 'Chỉ quản lý được xoá nhân viên';
    end if;
    if new.id = auth.uid() then
      raise exception 'Bạn không thể tự xoá chính mình';
    end if;
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
        insert into public.project_managers (project_id, user_id, added_by)
        select project_id, auth.uid(), auth.uid() from public.project_managers where user_id = new.id
        on conflict do nothing;
        delete from public.project_managers where user_id = new.id;
      elsif exists (select 1 from public.project_managers where user_id = new.id) then
        -- Chạy từ SQL Editor: không biết chuyển dự án cho ai
        raise exception 'Người này còn quản lý dự án. Hãy thêm quản lý khác cho các dự án đó và gỡ người này ra trước.';
      end if;
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. Quản lý xem được thành viên/quản lý của mọi dự án (sửa vẫn chỉ trong dự án mình)
-- ---------------------------------------------------------------------
drop policy project_members_select on public.project_members;
create policy project_members_select on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

drop policy project_managers_select on public.project_managers;
create policy project_managers_select on public.project_managers for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

-- ---------------------------------------------------------------------
-- Quyền (bảng/hàm mới mặc định được cấp cho anon → thu hồi)
-- ---------------------------------------------------------------------
revoke all on public.staff_details from anon;
grant select, insert, update on public.staff_details to authenticated;
grant all on public.staff_details to service_role;

revoke execute on function public.staff_details_before_write() from public, anon;
