-- =====================================================================
-- Cahute – Phần 15: ghi vị trí khi đổi trạng thái việc; bỏ Traccar
--
-- - task_status_events: lịch sử mọi lần đổi trạng thái (trigger tự ghi), kèm vị trí
--   nếu nhân viên gửi qua RPC set_task_status(). Toạ độ tự xoá sau 30 ngày.
-- - last_locations: vị trí cuối cùng của mỗi người (bản đồ trang Tổng quan),
--   giờ cập nhật từ lần đổi trạng thái có vị trí.
-- - Xoá phần Traccar: devices, locations, ingest_location().
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Lịch sử đổi trạng thái
-- ---------------------------------------------------------------------
create table public.task_status_events (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid references public.profiles (id) on delete set null,  -- null: đổi từ SQL Editor/service role
  from_status public.task_status not null,
  to_status   public.task_status not null,
  created_at  timestamptz not null default now(),
  lat         double precision check (lat between -90 and 90),
  lon         double precision check (lon between -180 and 180),
  accuracy    real check (accuracy >= 0),
  check ((lat is null) = (lon is null))
);

create index task_status_events_task_idx on public.task_status_events (task_id, created_at desc);

-- Xem được lịch sử khi xem được việc (RLS của tasks áp dụng trong truy vấn con):
-- quản lý dự án, hoặc nhân viên đang được giao việc. Không ai sửa/xoá lịch sử.
alter table public.task_status_events enable row level security;

create policy task_status_events_select on public.task_status_events for select to authenticated
  using (exists (select 1 from public.tasks t where t.id = task_id));

revoke all on public.task_status_events from anon;
revoke insert, update, delete on public.task_status_events from authenticated;
grant select on public.task_status_events to authenticated;
grant all on public.task_status_events to service_role;

-- ---------------------------------------------------------------------
-- 2. Trigger: mọi lần đổi status đều ghi lịch sử (kể cả quản lý đổi, kể cả không qua RPC).
--    Vị trí (nếu có) do set_task_status() để trong biến cục bộ của giao dịch.
-- ---------------------------------------------------------------------
alter table public.last_locations drop column speed, drop column battery;

create function public.tasks_after_status_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_loc jsonb := nullif(current_setting('cahute.status_location', true), '')::jsonb;
  v_lat double precision;
  v_lon double precision;
  v_acc real;
begin
  if v_loc is not null and (v_loc ->> 'task_id')::uuid = new.id then
    v_lat := (v_loc ->> 'lat')::double precision;
    v_lon := (v_loc ->> 'lon')::double precision;
    v_acc := (v_loc ->> 'accuracy')::real;
    -- Toạ độ sai thì bỏ vị trí, không làm hỏng việc đổi trạng thái
    if v_lat is null or v_lon is null or v_lat not between -90 and 90 or v_lon not between -180 and 180 then
      v_lat := null; v_lon := null; v_acc := null;
    end if;
    if v_acc < 0 then v_acc := null; end if;
  end if;

  insert into public.task_status_events (task_id, user_id, from_status, to_status, lat, lon, accuracy)
  values (new.id, auth.uid(), old.status, new.status, v_lat, v_lon, v_acc);

  if v_lat is not null and auth.uid() is not null then
    insert into public.last_locations (user_id, recorded_at, lat, lon, accuracy, updated_at)
    values (auth.uid(), now(), v_lat, v_lon, v_acc, now())
    on conflict (user_id) do update set
      recorded_at = excluded.recorded_at, lat = excluded.lat, lon = excluded.lon,
      accuracy = excluded.accuracy, updated_at = now();
  end if;

  return null;
end $$;

create trigger tasks_after_status_change
  after update of status on public.tasks
  for each row when (old.status is distinct from new.status)
  execute function public.tasks_after_status_change();

-- ---------------------------------------------------------------------
-- 3. RPC đổi trạng thái kèm vị trí (security invoker: RLS + tasks_before_update vẫn kiểm tra quyền
--    và luật chuyển trạng thái như khi update trực tiếp). Trả về false nếu không có quyền với việc này.
-- ---------------------------------------------------------------------
create function public.set_task_status(
  p_task_id  uuid,
  p_status   public.task_status,
  p_lat      double precision default null,
  p_lon      double precision default null,
  p_accuracy real default null
)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  perform set_config(
    'cahute.status_location',
    case when p_lat is not null and p_lon is not null
      then jsonb_build_object('task_id', p_task_id, 'lat', p_lat, 'lon', p_lon, 'accuracy', p_accuracy)::text
      else ''
    end,
    true  -- chỉ trong giao dịch này
  );
  update public.tasks set status = p_status where id = p_task_id;
  return found;
end $$;

revoke execute on function public.tasks_after_status_change() from public, anon;
revoke execute on function public.set_task_status(uuid, public.task_status, double precision, double precision, real) from public, anon;
grant execute on function public.set_task_status(uuid, public.task_status, double precision, double precision, real) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Dọn dẹp hằng đêm 02:00 giờ VN (19:00 UTC): xoá toạ độ cũ hơn 30 ngày (giữ dòng lịch sử),
--    vị trí cuối cùng cũ hơn 30 ngày, token Telegram hết hạn. Cùng tên job → thay job cũ.
-- ---------------------------------------------------------------------
select cron.schedule(
  'cahute-nightly-cleanup',
  '0 19 * * *',
  $$
    update public.task_status_events set lat = null, lon = null, accuracy = null
      where lat is not null and created_at < now() - interval '30 days';
    delete from public.last_locations where recorded_at < now() - interval '30 days';
    delete from public.telegram_link_tokens where expires_at < now();
  $$
);

-- ---------------------------------------------------------------------
-- 5. Bỏ Traccar
-- ---------------------------------------------------------------------
drop function public.ingest_location(text, timestamptz, double precision, double precision, real, real, real, real);
drop table public.locations;
drop table public.devices;
