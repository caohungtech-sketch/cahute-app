-- =====================================================================
-- Cahute – Phần 13: một dự án có một hoặc nhiều quản lý
--   projects.manager_id → bảng project_managers (project_id, user_id)
--   - Chỉ tài khoản có vai trò Quản lý mới được làm quản lý dự án
--   - Các quản lý của dự án có quyền ngang nhau (sửa/xoá dự án, giao việc,
--     thêm/gỡ nhân viên, thêm/gỡ quản lý khác)
--   - Dự án luôn còn ít nhất 1 quản lý
--   - Người tạo dự án tự động là quản lý của dự án
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bảng + chuyển dữ liệu
-- ---------------------------------------------------------------------
create table public.project_managers (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  added_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index project_managers_user_idx on public.project_managers (user_id);

insert into public.project_managers (project_id, user_id, added_by)
select id, manager_id, manager_id from public.projects where manager_id is not null;

-- ---------------------------------------------------------------------
-- 2. Hàm phân quyền: đọc từ project_managers
-- ---------------------------------------------------------------------
create or replace function public.manages_project(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.project_managers where project_id = p_project_id and user_id = auth.uid()) $$;

-- Quản lý của BẤT KỲ dự án nào mà p_user_id là thành viên
create or replace function public.manages_user(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    join public.project_managers pm on pm.project_id = m.project_id
    where m.user_id = p_user_id and pm.user_id = auth.uid()
  )
$$;

create or replace function public.manages_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    join public.project_managers pm on pm.project_id = t.project_id
    where t.id = p_task_id and pm.user_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------
-- 3. Trigger
-- ---------------------------------------------------------------------

-- Người tạo dự án là quản lý đầu tiên
create function public.projects_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into public.project_managers (project_id, user_id, added_by)
    values (new.id, auth.uid(), auth.uid());
  end if;
  return new;
end $$;

create trigger projects_after_insert
  after insert on public.projects
  for each row execute function public.projects_after_insert();

-- Chỉ tài khoản Quản lý mới được làm quản lý dự án
create function public.project_managers_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.user_id and role = 'manager') then
    raise exception 'Chỉ tài khoản Quản lý mới được làm quản lý dự án';
  end if;
  return new;
end $$;

create trigger project_managers_before_insert
  before insert on public.project_managers
  for each row execute function public.project_managers_before_insert();

-- Dự án luôn còn ít nhất 1 quản lý (trừ khi chính dự án hoặc tài khoản bị xoá)
create function public.project_managers_before_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.projects where id = old.project_id)
     or not exists (select 1 from public.profiles where id = old.user_id) then
    return old;
  end if;
  if not exists (
    select 1 from public.project_managers
    where project_id = old.project_id and user_id <> old.user_id
  ) then
    raise exception 'Dự án phải còn ít nhất một quản lý';
  end if;
  return old;
end $$;

create trigger project_managers_before_delete
  before delete on public.project_managers
  for each row execute function public.project_managers_before_delete();

-- Hạ quyền một quản lý → người thực hiện được thêm vào các dự án của họ, rồi gỡ họ ra
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
-- 4. RLS
-- ---------------------------------------------------------------------
drop policy projects_insert on public.projects;
drop policy projects_update on public.projects;
drop policy projects_delete on public.projects;

create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_manager());
create policy projects_update on public.projects for update to authenticated
  using (public.manages_project(id)) with check (public.manages_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.manages_project(id));

alter table public.project_managers enable row level security;

create policy project_managers_select on public.project_managers for select to authenticated
  using (user_id = auth.uid() or public.manages_project(project_id));
create policy project_managers_insert on public.project_managers for insert to authenticated
  with check (public.manages_project(project_id));
create policy project_managers_delete on public.project_managers for delete to authenticated
  using (public.manages_project(project_id));

-- Không còn dùng (policy cũ đã bỏ ở trên)
alter table public.projects drop column manager_id;

-- ---------------------------------------------------------------------
-- 5. Quyền (bảng/hàm mới mặc định được cấp cho anon → thu hồi)
-- ---------------------------------------------------------------------
revoke all on public.project_managers from anon;
grant select, insert, delete on public.project_managers to authenticated;
grant all on public.project_managers to service_role;

revoke execute on function public.projects_after_insert() from public, anon;
revoke execute on function public.project_managers_before_insert() from public, anon;
revoke execute on function public.project_managers_before_delete() from public, anon;
