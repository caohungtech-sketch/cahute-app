# Thông báo giao việc (Web Push + Telegram)

> Đặc tả chi tiết, tách ra từ CLAUDE.md (mục 9). Đọc file này trước khi làm tính năng thông báo.

Luồng: trigger `AFTER INSERT` trên `task_assignees` (chỉ người **mới được thêm** nhận thông báo, người đã có sẵn thì không) → insert `notifications (id, user_id, task_id, title, read_at, push_status, telegram_status)` → Database Webhook gọi Edge Function `notify` → gửi Web Push + Telegram.

- **Không bao giờ để thông báo làm chặn hoặc rollback việc giao việc.** Lỗi gửi chỉ ghi vào `push_status`/`telegram_status`.
- **Trong app:** subscribe Realtime bảng `notifications` của user → toast + badge.
- **Web Push:** VAPID, bảng `push_subscriptions (user_id, endpoint, p256dh, auth)`. Khi push trả 404/410 thì xoá subscription. Trên iPhone, Web Push chỉ chạy khi đã **"Thêm vào màn hình chính"** (iOS 16.4+) → UI phải hướng dẫn.
- **Telegram:**
  - Liên kết tài khoản: app tạo token dùng một lần (hết hạn 15 phút) → mở `https://t.me/<bot>?start=<token>` → Edge Function `telegram-webhook` lưu `profiles.telegram_chat_id`. Webhook phải kiểm tra header `X-Telegram-Bot-Api-Secret-Token`.
  - Nội dung chỉ gồm: "Bạn được giao việc: <tiêu đề>" + link mở việc trong app. Không gửi mô tả chi tiết, bình luận, ảnh.
  - Bot trả 403 (người dùng chặn bot) → xoá `telegram_chat_id`. Gặp 429 → chờ `retry_after` rồi thử lại một lần.
