-- =====================================================================
-- Cahute – Phần 4: định vị Traccar → Supabase
-- Edge Function `traccar-ingest` nhận dữ liệu từ Traccar Client rồi gọi
-- hàm ingest_location() bằng service role.
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;

create table public.devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  traccar_id text not null unique check (length(traccar_id) >= 16),
  label      text,
  created_at timestamptz not null default now()
);

create index devices_user_idx on public.devices (user_id);

create table public.locations (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  device_id   uuid references public.devices (id) on delete set null,
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  accuracy    real,
  speed       real,
  bearing     real,
  battery     real
);

create index locations_user_time_idx on public.locations (user_id, recorded_at desc);

-- Vị trí mới nhất của mỗi nhân viên – dùng để vẽ bản đồ nhanh + Realtime.
create table public.last_locations (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  recorded_at timestamptz not null,
  lat         double precision not null,
  lon         double precision not null,
  accuracy    real,
  speed       real,
  battery     real,
  updated_at  timestamptz not null default now()
);

-- Trả về: 'stored' | 'throttled' | 'inaccurate' | 'unknown_device'
create function public.ingest_location(
  p_traccar_id  text,
  p_recorded_at timestamptz,
  p_lat         double precision,
  p_lon         double precision,
  p_accuracy    real default null,
  p_speed       real default null,
  p_bearing     real default null,
  p_battery     real default null
)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_device public.devices%rowtype;
begin
  select * into v_device from public.devices where traccar_id = p_traccar_id;
  if not found then return 'unknown_device'; end if;

  if p_accuracy is not null and p_accuracy > 200 then return 'inaccurate'; end if;

  -- Giới hạn 60 s: bỏ điểm cách điểm đã lưu (trước hoặc sau, kể cả điểm gửi bù khi offline) < 55 s
  if exists (
    select 1 from public.locations
    where user_id = v_device.user_id
      and recorded_at > p_recorded_at - interval '55 seconds'
      and recorded_at < p_recorded_at + interval '55 seconds'
  ) then
    return 'throttled';
  end if;

  insert into public.locations (user_id, device_id, recorded_at, lat, lon, accuracy, speed, bearing, battery)
  values (v_device.user_id, v_device.id, p_recorded_at, p_lat, p_lon, p_accuracy, p_speed, p_bearing, p_battery);

  insert into public.last_locations (user_id, recorded_at, lat, lon, accuracy, speed, battery, updated_at)
  values (v_device.user_id, p_recorded_at, p_lat, p_lon, p_accuracy, p_speed, p_battery, now())
  on conflict (user_id) do update set
    recorded_at = excluded.recorded_at, lat = excluded.lat, lon = excluded.lon,
    accuracy = excluded.accuracy, speed = excluded.speed, battery = excluded.battery,
    updated_at = now()
  where public.last_locations.recorded_at < excluded.recorded_at;

  return 'stored';
end $$;

-- ---------------------------------------------------------------------
-- RLS: nhân viên chỉ thấy của mình, quản lý thấy nhân viên trong nhóm mình.
-- Không có policy insert cho locations/last_locations: chỉ service role ghi.
-- ---------------------------------------------------------------------
alter table public.devices        enable row level security;
alter table public.locations      enable row level security;
alter table public.last_locations enable row level security;

create policy devices_select on public.devices for select to authenticated
  using (user_id = auth.uid() or public.manages_user(user_id));
create policy devices_insert on public.devices for insert to authenticated
  with check (public.manages_user(user_id));
create policy devices_update on public.devices for update to authenticated
  using (public.manages_user(user_id)) with check (public.manages_user(user_id));
create policy devices_delete on public.devices for delete to authenticated
  using (public.manages_user(user_id));

create policy locations_select on public.locations for select to authenticated
  using (user_id = auth.uid() or public.manages_user(user_id));

create policy last_locations_select on public.last_locations for select to authenticated
  using (user_id = auth.uid() or public.manages_user(user_id));

-- ---------------------------------------------------------------------
-- Dọn dẹp hằng đêm lúc 02:00 giờ VN (19:00 UTC): lịch sử > 30 ngày, token hết hạn
-- ---------------------------------------------------------------------
select cron.schedule(
  'cahute-nightly-cleanup',
  '0 19 * * *',
  $$
    delete from public.locations where recorded_at < now() - interval '30 days';
    delete from public.telegram_link_tokens where expires_at < now();
  $$
);
