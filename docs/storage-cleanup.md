# Dọn ảnh mồ côi trong Storage

> Đặc tả + hướng dẫn cài đặt. Liên quan CLAUDE.md mục 11 (ảnh tải lên).

## Vấn đề

Ảnh báo cáo lưu ở bucket `attachments`, đường dẫn `tasks/{task_id}/{uuid}.webp`, thông tin ảnh ở bảng `task_attachments (storage_path)`. File trở thành **mồ côi** (vẫn chiếm dung lượng, không ai xem được) khi:
1. Xoá việc hoặc xoá dự án: dòng `task_attachments` bị xoá theo (cascade), file ở lại.
2. Gửi bình luận lỗi sau khi đã upload ảnh (`CommentForm` upload ảnh trước, lưu bình luận sau).

## Cách hoạt động (migration 0016 + Edge Function `storage-cleanup`)

- Hàm SQL `find_orphan_attachments(p_limit)` (chỉ `service_role` gọi được): file trong `tasks/…` **không có dòng `task_attachments` nào trỏ tới** và **tải lên hơn 24 giờ** (chừa thời gian cho ảnh đang gửi dở).
- Edge Function `supabase/functions/storage-cleanup/index.ts`: gọi hàm trên rồi xoá file **qua Storage API** (không xoá bằng SQL) theo đợt 100 file, tối đa 5.000 file mỗi đêm. Ghi kết quả mỗi lần chạy vào bảng `storage_cleanup_runs`.
- `pg_cron` job `cahute-storage-cleanup` chạy **02:30 giờ VN** mỗi đêm, gọi Edge Function bằng `pg_net` kèm header `x-cleanup-secret`. URL và mã bí mật lấy từ **Vault** (không ghi trong migration).
- **Chế độ chỉ đếm (dry run) là mặc định**: chỉ ghi số file/dung lượng sẽ được thu hồi. Xoá thật khi đặt secret `CLEANUP_DRY_RUN=false`.
- Function deploy với `--no-verify-jwt`; bảo vệ bằng `CLEANUP_SECRET` thay cho JWT.
- Khi làm Chat (ảnh trong `chat/…`): mở rộng điều kiện trong `find_orphan_attachments` để dọn cả ảnh chat.

## Cài đặt (làm một lần, theo thứ tự)

Chạy trong terminal VS Code, tại thư mục dự án.

1. **Database:** `npx supabase db push --remote` → kiểm tra danh sách chỉ có `20261106000016_storage_cleanup.sql` → `Y`.
2. **Tạo mã bí mật** (chuỗi ngẫu nhiên dài) – chạy lệnh sau, sao chép kết quả, **không gửi cho ai**:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. **Lưu mã cho Edge Function:** `npx supabase secrets set CLEANUP_SECRET=<mã ở bước 2>`
4. **Deploy Edge Function:** `npx supabase functions deploy storage-cleanup --no-verify-jwt`
5. **Lưu URL và mã vào Vault** (Supabase → SQL Editor → New query), thay `<…>` rồi bấm Run:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<mã ở bước 2>', 'cleanup_secret');
   ```
   (`<project-ref>` lấy ở Project Settings → General → Reference ID.) Xoá nội dung ô SQL sau khi chạy.

## Kiểm tra và bật xoá thật

- Sau 02:30 đêm đầu tiên: Supabase → Table Editor → bảng `storage_cleanup_runs` → dòng mới có `dry_run = true`, `found_files`, `found_bytes` (byte), `error` trống.
  - Có lỗi / không có dòng nào: SQL Editor chạy `select * from cron.job_run_details order by start_time desc limit 5;` và `select * from net._http_response order by created desc limit 5;` để xem nguyên nhân.
- Thấy số liệu hợp lý → bật xoá thật: `npx supabase secrets set CLEANUP_DRY_RUN=false` (không cần deploy lại). Đêm sau `dry_run = false`, `deleted` > 0.
- Tắt lại chế độ chỉ đếm: `npx supabase secrets unset CLEANUP_DRY_RUN`.
