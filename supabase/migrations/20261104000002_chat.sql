-- =====================================================================
-- Cahute – Phần 2: chat nội bộ
-- =====================================================================

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('direct', 'group')),
  name            text check (length(name) <= 100),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null default auth.uid(),
  body            text check (length(body) <= 4000),
  image_path      text,
  created_at      timestamptz not null default now(),
  check (coalesce(length(trim(body)), 0) > 0 or image_path is not null)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  )
$$;

-- Mở (hoặc tạo) cuộc trò chuyện 1-1. Trả về conversation_id.
create function public.start_direct_chat(p_other_user uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if p_other_user = auth.uid() then raise exception 'Không thể chat với chính mình'; end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'Người dùng không tồn tại';
  end if;

  select c.id into v_id
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = auth.uid()
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = p_other_user
  where c.type = 'direct'
  limit 1;

  if v_id is null then
    insert into public.conversations (type, created_by) values ('direct', auth.uid()) returning id into v_id;
    insert into public.conversation_members (conversation_id, user_id)
    values (v_id, auth.uid()), (v_id, p_other_user);
  end if;

  return v_id;
end $$;

-- Tạo nhóm chat; người tạo tự động là thành viên.
create function public.create_group_chat(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Chưa đăng nhập'; end if;
  if coalesce(length(trim(p_name)), 0) = 0 then raise exception 'Cần đặt tên nhóm'; end if;

  insert into public.conversations (type, name, created_by)
  values ('group', trim(p_name), auth.uid()) returning id into v_id;

  insert into public.conversation_members (conversation_id, user_id)
  select v_id, u from (
    select unnest(p_member_ids || auth.uid()) as u
  ) s
  where exists (select 1 from public.profiles where id = s.u)
  on conflict do nothing;

  return v_id;
end $$;

create function public.messages_after_insert()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  -- Người gửi coi như đã đọc tới tin của mình
  update public.conversation_members set last_read_at = new.created_at
  where conversation_id = new.conversation_id and user_id = new.sender_id;
  return new;
end $$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------------
-- RLS – chỉ thành viên mới thấy. Tạo cuộc trò chuyện qua 2 hàm RPC ở trên.
-- ---------------------------------------------------------------------
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
create policy conversations_update on public.conversations for update to authenticated
  using (type = 'group' and created_by = auth.uid());

create policy conversation_members_select on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
-- chỉ được cập nhật last_read_at của chính mình (xem grant cột ở file 0006)
create policy conversation_members_update on public.conversation_members for update to authenticated
  using (user_id = auth.uid());
create policy conversation_members_delete on public.conversation_members for delete to authenticated
  using (user_id = auth.uid());  -- rời nhóm

create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_conversation_member(conversation_id) and sender_id = auth.uid());
