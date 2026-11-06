-- =====================================================================
-- Cahute – Phần 16: dọn ảnh mồ côi trong Storage (bucket attachments)
--
-- Ảnh mồ côi = file trong tasks/… không còn dòng task_attachments nào trỏ tới:
--   - xoá việc / xoá dự án (dòng task_attachments bị cascade, file ở lại),
--   - gửi bình luận lỗi sau khi đã upload ảnh.
-- Edge Function `storage-cleanup` (service role) gọi find_orphan_attachments() rồi xoá file
-- qua Storage API (không xoá bằng SQL). Chạy hằng đêm 02:30 giờ VN bằng pg_cron + pg_net.
-- Mặc định chỉ đếm (dry run); bật xoá thật bằng secret CLEANUP_DRY_RUN=false của Edge Function.
-- Xem docs/storage-cleanup.md.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- Danh sách file mồ côi đã tải lên hơn 24 giờ (chừa thời gian cho ảnh đang gửi dở).
create function public.find_orphan_attachments(p_limit int default 1000)
returns table (name text, size_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select o.name, coalesce((o.metadata ->> 'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'attachments'
    and o.name like 'tasks/%'
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.task_attachments a where a.storage_path = o.name)
  order by o.created_at
  limit greatest(p_limit, 0);
$$;

revoke execute on function public.find_orphan_attachments(int) from public, anon, authenticated;
grant execute on function public.find_orphan_attachments(int) to service_role;

-- Nhật ký mỗi lần chạy (xem trong Table Editor). Chỉ service role đọc/ghi.
create table public.storage_cleanup_runs (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),
  dry_run     boolean not null,
  found_files int not null default 0,
  found_bytes bigint not null default 0,
  deleted     int not null default 0,
  error       text
);

alter table public.storage_cleanup_runs enable row level security;
-- Không có policy: người dùng app không đọc/ghi được.
revoke all on public.storage_cleanup_runs from anon, authenticated;
grant all on public.storage_cleanup_runs to service_role;

-- Lịch chạy: gọi Edge Function. URL project và mã bí mật lấy từ Vault (không ghi cứng vào migration):
--   vault secret 'project_url'    = https://<project-ref>.supabase.co
--   vault secret 'cleanup_secret' = trùng với secret CLEANUP_SECRET của Edge Function
-- Thiếu secret thì lần gọi lỗi (xem cron.job_run_details / net._http_response), không ảnh hưởng gì khác.
select cron.schedule(
  'cahute-storage-cleanup',
  '30 19 * * *',  -- 02:30 giờ VN
  $$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/storage-cleanup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);
