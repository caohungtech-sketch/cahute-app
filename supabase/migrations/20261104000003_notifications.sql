-- =====================================================================
-- Cahute – Phần 3: thông báo giao việc (trong app, Web Push, Telegram)
-- Việc gửi Web Push/Telegram do Edge Function `notify` làm, được gọi bằng
-- Database Webhook trên bảng notifications (tạo sau khi deploy function).
-- =====================================================================

create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  type            text not null default 'task_assigned',
  task_id         uuid references public.tasks (id) on delete cascade,
  title           text not null,
  read_at         timestamptz,
  push_status     text,      -- do Edge Function ghi: sent | failed: ... | skipped
  telegram_status text,
  created_at      timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Liên kết Telegram: chỉ Edge Function (service role) được ghi.
create table public.telegram_links (
  user_id   uuid primary key references public.profiles (id) on delete cascade,
  chat_id   bigint not null unique,
  linked_at timestamptz not null default now()
);

create table public.telegram_link_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '15 minutes'
);

-- Tạo token dùng một lần để mở https://t.me/<bot>?start=<token>
create function public.create_telegram_link_token()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  delete from public.telegram_link_tokens where user_id = auth.uid();
  insert into public.telegram_link_tokens (token, user_id) values (v_token, auth.uid());
  return v_token;
end $$;

-- Chỉ người MỚI được thêm vào việc mới nhận thông báo.
create function public.task_assignees_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, type, task_id, title)
    select new.user_id, 'task_assigned', t.id, 'Bạn được giao việc: ' || t.title
    from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end $$;

create trigger task_assignees_after_insert
  after insert on public.task_assignees
  for each row execute function public.task_assignees_after_insert();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.notifications        enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.telegram_links       enable row level security;
alter table public.telegram_link_tokens enable row level security;  -- không policy: chỉ service role

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
-- chỉ được đánh dấu đã đọc (grant cột read_at ở file 0006)
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid());

create policy push_subscriptions_all on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy telegram_links_select on public.telegram_links for select to authenticated
  using (user_id = auth.uid());
create policy telegram_links_delete on public.telegram_links for delete to authenticated
  using (user_id = auth.uid());  -- tự huỷ liên kết
