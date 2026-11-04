-- =====================================================================
-- Cahute – Phần 1: người dùng, nhóm, công việc, bình luận
-- =====================================================================

create type public.user_role as enum ('manager', 'staff');
create type public.task_status as enum ('todo', 'in_progress', 'paused', 'done');

-- ---------------------------------------------------------------------
-- Bảng
-- ---------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 100),
  manager_id  uuid,                                  -- FK thêm sau khi có profiles
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '' check (length(full_name) <= 100),
  role        public.user_role not null default 'staff',
  team_id     uuid references public.teams (id) on delete set null,
  avatar_path text,
  created_at  timestamptz not null default now()
);

alter table public.teams
  add constraint teams_manager_id_fkey
  foreign key (manager_id) references public.profiles (id) on delete set null;

create index profiles_team_id_idx on public.profiles (team_id);
create index teams_manager_id_idx on public.teams (manager_id);

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams (id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 10000),
  status      public.task_status not null default 'todo',
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  due_at      timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_team_status_idx on public.tasks (team_id, status, updated_at desc);

-- Một việc có thể giao cho nhiều nhân viên.
create table public.task_assignees (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null default auth.uid(),
  assigned_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

create index task_assignees_user_idx on public.task_assignees (user_id);

create table public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null default auth.uid(),
  body        text not null default '' check (length(body) <= 4000),
  created_at  timestamptz not null default now()
);

create index task_comments_task_idx on public.task_comments (task_id, created_at desc);

create table public.task_attachments (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  comment_id   uuid references public.task_comments (id) on delete cascade,
  uploaded_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  storage_path text not null unique,
  mime_type    text not null check (mime_type in ('image/webp', 'image/jpeg')),
  width        int,
  height       int,
  size_bytes   int check (size_bytes <= 1048576),
  created_at   timestamptz not null default now()
);

create index task_attachments_task_idx on public.task_attachments (task_id);
create index task_attachments_comment_idx on public.task_attachments (comment_id);

-- ---------------------------------------------------------------------
-- Hàm phân quyền dùng trong policy (security definer để tránh đệ quy RLS)
-- ---------------------------------------------------------------------
create function public.my_role()
returns public.user_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = auth.uid() $$;

create function public.is_manager()
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select role = 'manager' from public.profiles where id = auth.uid()), false) $$;

create function public.manages_team(p_team_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.teams where id = p_team_id and manager_id = auth.uid()) $$;

-- true nếu người gọi là quản lý của nhóm mà p_user_id thuộc về
create function public.manages_user(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.teams t on t.id = p.team_id
    where p.id = p_user_id and t.manager_id = auth.uid()
  )
$$;

create function public.manages_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    join public.teams tm on tm.id = t.team_id
    where t.id = p_task_id and tm.manager_id = auth.uid()
  )
$$;

create function public.is_task_assignee(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.task_assignees where task_id = p_task_id and user_id = auth.uid()) $$;

create function public.can_access_task(p_task_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select public.manages_task(p_task_id) or public.is_task_assignee(p_task_id) $$;

-- ---------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------

-- Tạo profile khi đăng ký. Tài khoản đầu tiên là quản lý.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100),
    (case when exists (select 1 from public.profiles) then 'staff' else 'manager' end)::public.user_role
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Chỉ quản lý được đổi vai trò / nhóm.
create function public.profiles_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return new; end if;  -- service role / SQL Editor
  if new.id <> old.id then
    raise exception 'Không được đổi id';
  end if;
  if (new.role, new.team_id) is distinct from (old.role, old.team_id) and not public.is_manager() then
    raise exception 'Chỉ quản lý được đổi vai trò hoặc nhóm';
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- Việc mới luôn bắt đầu ở "Chưa làm".
create function public.tasks_before_insert()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  new.status := 'todo';
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_before_insert
  before insert on public.tasks
  for each row execute function public.tasks_before_insert();

-- Quy tắc đổi trạng thái (CLAUDE.md mục 5).
create function public.tasks_before_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();

  if auth.uid() is null then return new; end if;  -- service role / SQL Editor

  if public.manages_team(old.team_id) then
    if new.team_id <> old.team_id and not public.manages_team(new.team_id) then
      raise exception 'Không thể chuyển việc sang nhóm bạn không quản lý';
    end if;
    return new;  -- quản lý: mọi chuyển đổi
  end if;

  -- Nhân viên được giao: chỉ được đổi status
  if (new.title, new.description, new.team_id, new.due_at, new.created_by, new.created_at)
     is distinct from
     (old.title, old.description, old.team_id, old.due_at, old.created_by, old.created_at) then
    raise exception 'Nhân viên chỉ được đổi trạng thái công việc';
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

create trigger tasks_before_update
  before update on public.tasks
  for each row execute function public.tasks_before_update();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.teams            enable row level security;
alter table public.profiles         enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_assignees   enable row level security;
alter table public.task_comments    enable row level security;
alter table public.task_attachments enable row level security;

-- teams: ai đăng nhập cũng xem được tên nhóm; quản lý tạo/sửa nhóm của mình
create policy teams_select on public.teams for select to authenticated using (true);
create policy teams_insert on public.teams for insert to authenticated
  with check (public.is_manager() and manager_id = auth.uid());
create policy teams_update on public.teams for update to authenticated
  using (manager_id = auth.uid()) with check (public.is_manager());
create policy teams_delete on public.teams for delete to authenticated
  using (manager_id = auth.uid());

-- profiles: xem tên mọi người (cần cho chat, danh sách người được giao)
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_manager());

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (public.manages_team(team_id) or public.is_task_assignee(id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.manages_team(team_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.manages_team(team_id) or public.is_task_assignee(id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.manages_team(team_id));

-- task_assignees: chỉ quản lý của việc thêm/bớt, và chỉ người trong nhóm mình
create policy task_assignees_select on public.task_assignees for select to authenticated
  using (public.can_access_task(task_id));
create policy task_assignees_insert on public.task_assignees for insert to authenticated
  with check (public.manages_task(task_id) and public.manages_user(user_id));
create policy task_assignees_delete on public.task_assignees for delete to authenticated
  using (public.manages_task(task_id));

-- task_comments
create policy task_comments_select on public.task_comments for select to authenticated
  using (public.can_access_task(task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (public.can_access_task(task_id) and author_id = auth.uid());
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = auth.uid() or public.manages_task(task_id));

-- task_attachments
create policy task_attachments_select on public.task_attachments for select to authenticated
  using (public.can_access_task(task_id));
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (public.can_access_task(task_id) and uploaded_by = auth.uid());
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.manages_task(task_id));
