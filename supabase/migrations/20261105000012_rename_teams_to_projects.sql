-- =====================================================================
-- Cahute – Phần 12: đổi "Nhóm" thành "Dự án"
--   teams → projects, team_members → project_members, *.team_id → project_id
-- Chỉ đổi tên, không đổi ý nghĩa. Dữ liệu, quyền bảng, Realtime giữ nguyên
-- (đổi tên bảng/cột không làm mất grant và publication).
-- Thân hàm lưu dạng text nên KHÔNG tự cập nhật theo tên mới → phải tạo lại.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bảng, cột, index, constraint, trigger, policy
-- ---------------------------------------------------------------------
alter table public.teams rename to projects;
alter table public.team_members rename to project_members;
alter table public.project_members rename column team_id to project_id;
alter table public.tasks rename column team_id to project_id;

alter index public.teams_manager_id_idx  rename to projects_manager_id_idx;
alter index public.tasks_team_status_idx rename to tasks_project_status_idx;
alter index public.team_members_user_idx rename to project_members_user_idx;

-- teams_pkey, teams_name_check, teams_manager_id_fkey, tasks_team_id_fkey, team_members_* …
do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where conrelid in ('public.projects'::regclass, 'public.project_members'::regclass, 'public.tasks'::regclass)
      and (conname like 'teams\_%' or conname like 'team\_members\_%' or conname like '%team\_id%')
  loop
    execute format(
      'alter table %s rename constraint %I to %I',
      r.tbl, r.conname,
      replace(replace(replace(r.conname, 'team_members_', 'project_members_'), 'teams_', 'projects_'), 'team_id', 'project_id')
    );
  end loop;
end $$;

alter trigger team_members_after_delete on public.project_members rename to project_members_after_delete;
alter function public.team_members_after_delete() rename to project_members_after_delete;

alter policy teams_select on public.projects rename to projects_select;
alter policy teams_insert on public.projects rename to projects_insert;
alter policy teams_update on public.projects rename to projects_update;
alter policy teams_delete on public.projects rename to projects_delete;

-- ---------------------------------------------------------------------
-- 2. Hàm phân quyền mới
-- ---------------------------------------------------------------------
create function public.manages_project(p_project_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.projects where id = p_project_id and manager_id = auth.uid()) $$;

create function public.is_project_member(p_project_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.project_members where project_id = p_project_id and user_id = p_user_id) $$;

-- true nếu p_user_id thuộc dự án của việc p_task_id
create function public.task_project_has_member(p_task_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    join public.project_members m on m.project_id = t.project_id
    where t.id = p_task_id and m.user_id = p_user_id
  )
$$;

-- Quản lý của BẤT KỲ dự án nào mà p_user_id thuộc về
create or replace function public.manages_user(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.project_members m
    join public.projects p on p.id = m.project_id
    where m.user_id = p_user_id and p.manager_id = auth.uid()
  )
$$;

create or replace function public.manages_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    join public.projects p on p.id = t.project_id
    where t.id = p_task_id and p.manager_id = auth.uid()
  )
$$;

-- ---------------------------------------------------------------------
-- 3. Policy dùng hàm cũ → tạo lại với hàm mới
-- ---------------------------------------------------------------------
drop policy tasks_select on public.tasks;
drop policy tasks_insert on public.tasks;
drop policy tasks_update on public.tasks;
drop policy tasks_delete on public.tasks;

create policy tasks_select on public.tasks for select to authenticated
  using (public.manages_project(project_id) or public.is_task_assignee(id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.manages_project(project_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.manages_project(project_id) or public.is_task_assignee(id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.manages_project(project_id));

drop policy team_members_select on public.project_members;
drop policy team_members_insert on public.project_members;
drop policy team_members_delete on public.project_members;

create policy project_members_select on public.project_members for select to authenticated
  using (user_id = auth.uid() or public.manages_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.manages_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.manages_project(project_id));

-- Người được giao phải là thành viên đúng dự án của việc
drop policy task_assignees_insert on public.task_assignees;
create policy task_assignees_insert on public.task_assignees for insert to authenticated
  with check (public.manages_task(task_id) and public.task_project_has_member(task_id, user_id));

-- ---------------------------------------------------------------------
-- 4. Trigger function có tham chiếu bảng/cột cũ
-- ---------------------------------------------------------------------

-- Rời dự án → gỡ khỏi các việc CHƯA hoàn thành của dự án đó
create or replace function public.project_members_after_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.task_assignees a
  using public.tasks t
  where a.task_id = t.id
    and a.user_id = old.user_id
    and t.project_id = old.project_id
    and t.status <> 'done';
  return old;
end $$;

create or replace function public.tasks_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();

  if auth.uid() is null then return new; end if;  -- service role / SQL Editor

  if public.manages_project(old.project_id) then
    if new.project_id <> old.project_id and not public.manages_project(new.project_id) then
      raise exception 'Không thể chuyển việc sang dự án bạn không quản lý';
    end if;
    return new;  -- quản lý: mọi thay đổi
  end if;

  -- Nhân viên được giao: chỉ được đổi status và result
  if (new.title, new.description, new.project_id, new.due_at, new.created_by, new.created_at)
     is distinct from
     (old.title, old.description, old.project_id, old.due_at, old.created_by, old.created_at) then
    raise exception 'Nhân viên chỉ được đổi trạng thái và kết quả công việc';
  end if;

  if new.status <> old.status and (old.status, new.status) not in (
    ('todo'::public.task_status,        'in_progress'::public.task_status),
    ('in_progress'::public.task_status, 'paused'::public.task_status),
    ('paused'::public.task_status,      'in_progress'::public.task_status),
    ('in_progress'::public.task_status, 'done'::public.task_status),
    ('paused'::public.task_status,      'done'::public.task_status)
  ) then
    raise exception 'Không được chuyển trạng thái từ % sang %', old.status, new.status;
  end if;

  return new;
end $$;

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
        update public.projects set manager_id = auth.uid() where manager_id = new.id;
      elsif exists (select 1 from public.projects where manager_id = new.id) then
        -- Chạy từ SQL Editor: không biết chuyển dự án cho ai
        raise exception 'Người này còn quản lý dự án. Hãy chuyển các dự án sang quản lý khác trước.';
      end if;
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- 5. Tìm nhanh: tham số p_team_id → p_project_id (đổi tên tham số phải drop)
-- ---------------------------------------------------------------------
drop function public.search_tasks(text, uuid, int);

create function public.search_tasks(q text, p_project_id uuid default null, max_results int default 8)
returns table (id uuid, title text, status public.task_status)
language sql stable security invoker
set search_path = public, extensions
as $$
  with s as (
    select n as term,
           '%' || replace(replace(replace(n, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
    from (select public.search_normalize(trim(q)) as n) x
  )
  select t.id, t.title, t.status
  from public.tasks t, s
  where length(s.term) >= 2
    and (p_project_id is null or t.project_id = p_project_id)
    and (public.search_normalize(t.title) like s.pattern or s.term <% public.search_normalize(t.title))
  order by public.search_normalize(t.title) like s.pattern desc,
           word_similarity(s.term, public.search_normalize(t.title)) desc,
           t.updated_at desc
  limit least(greatest(max_results, 1), 20)
$$;

-- ---------------------------------------------------------------------
-- 6. Bỏ hàm cũ
-- ---------------------------------------------------------------------
drop function public.manages_team(uuid);
drop function public.is_team_member(uuid, uuid);
drop function public.task_team_has_member(uuid, uuid);

-- ---------------------------------------------------------------------
-- 7. Quyền thực thi (hàm mới mặc định được cấp cho public/anon → thu hồi)
-- ---------------------------------------------------------------------
revoke execute on function public.manages_project(uuid) from public, anon;
revoke execute on function public.is_project_member(uuid, uuid) from public, anon;
revoke execute on function public.task_project_has_member(uuid, uuid) from public, anon;
revoke execute on function public.search_tasks(text, uuid, int) from public, anon;

grant execute on function public.manages_project(uuid) to authenticated, service_role;
grant execute on function public.is_project_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.task_project_has_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.search_tasks(text, uuid, int) to authenticated, service_role;
