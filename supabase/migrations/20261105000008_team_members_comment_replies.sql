-- =====================================================================
-- Cahute – Phần 8:
--   1. Một nhân viên thuộc được nhiều nhóm (bảng team_members thay cho profiles.team_id)
--   2. Trả lời bình luận (1 cấp: trả lời luôn gắn vào bình luận gốc)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. team_members
-- ---------------------------------------------------------------------
create table public.team_members (
  team_id  uuid not null references public.teams (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members (user_id);

-- Chuyển dữ liệu cũ
insert into public.team_members (team_id, user_id)
select team_id, id from public.profiles where team_id is not null
on conflict do nothing;

create function public.is_team_member(p_team_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.team_members where team_id = p_team_id and user_id = p_user_id) $$;

-- true nếu p_user_id thuộc nhóm của việc p_task_id
create function public.task_team_has_member(p_task_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    join public.team_members m on m.team_id = t.team_id
    where t.id = p_task_id and m.user_id = p_user_id
  )
$$;

-- Quản lý của BẤT KỲ nhóm nào mà p_user_id thuộc về
create or replace function public.manages_user(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    join public.teams t on t.id = m.team_id
    where m.user_id = p_user_id and t.manager_id = auth.uid()
  )
$$;

-- Người được giao phải là thành viên đúng nhóm của việc
drop policy task_assignees_insert on public.task_assignees;
create policy task_assignees_insert on public.task_assignees for insert to authenticated
  with check (public.manages_task(task_id) and public.task_team_has_member(task_id, user_id));

-- Rời nhóm → gỡ khỏi các việc CHƯA hoàn thành của nhóm đó (việc đã xong giữ lại lịch sử)
create function public.team_members_after_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.task_assignees a
  using public.tasks t
  where a.task_id = t.id
    and a.user_id = old.user_id
    and t.team_id = old.team_id
    and t.status <> 'done';
  return old;
end $$;

create trigger team_members_after_delete
  after delete on public.team_members
  for each row execute function public.team_members_after_delete();

-- profiles không còn team_id: chỉ còn chặn tự đổi vai trò
create or replace function public.profiles_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;  -- service role / SQL Editor
  if new.id <> old.id then
    raise exception 'Không được đổi id';
  end if;
  if new.role is distinct from old.role and not public.is_manager() then
    raise exception 'Chỉ quản lý được đổi vai trò';
  end if;
  return new;
end $$;

alter table public.profiles drop column team_id;

alter table public.team_members enable row level security;

create policy team_members_select on public.team_members for select to authenticated
  using (user_id = auth.uid() or public.manages_team(team_id));
create policy team_members_insert on public.team_members for insert to authenticated
  with check (public.manages_team(team_id));
create policy team_members_delete on public.team_members for delete to authenticated
  using (public.manages_team(team_id));

-- ---------------------------------------------------------------------
-- 2. Trả lời bình luận
-- ---------------------------------------------------------------------
alter table public.task_comments
  add column parent_id uuid references public.task_comments (id) on delete cascade;

create index task_comments_parent_idx on public.task_comments (parent_id);

create function public.task_comments_before_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_parent public.task_comments%rowtype;
begin
  if new.parent_id is null then return new; end if;

  select * into v_parent from public.task_comments where id = new.parent_id;
  if not found or v_parent.task_id <> new.task_id then
    raise exception 'Bình luận được trả lời không thuộc công việc này';
  end if;
  -- Chỉ 1 cấp: trả lời một câu trả lời thì gắn vào bình luận gốc
  new.parent_id := coalesce(v_parent.parent_id, v_parent.id);
  return new;
end $$;

create trigger task_comments_before_insert
  before insert on public.task_comments
  for each row execute function public.task_comments_before_insert();

-- ---------------------------------------------------------------------
-- Quyền (bảng/hàm mới mặc định được cấp cho anon → thu hồi)
-- ---------------------------------------------------------------------
revoke all on public.team_members from anon;
grant select, insert, delete on public.team_members to authenticated;
grant all on public.team_members to service_role;

revoke execute on function public.is_team_member(uuid, uuid) from public, anon;
revoke execute on function public.task_team_has_member(uuid, uuid) from public, anon;
grant execute on function public.is_team_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.task_team_has_member(uuid, uuid) to authenticated, service_role;
revoke execute on function public.team_members_after_delete() from public, anon;
revoke execute on function public.task_comments_before_insert() from public, anon;
