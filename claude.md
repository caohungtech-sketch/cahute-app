# CLAUDE.md – Cahute App

Web app giao nhận việc cho đội nhân viên hiện trường: danh sách + Kanban, chat nội bộ, thông báo giao việc qua Web Push và Telegram, định vị nhân viên bằng Traccar Client. Nhân viên dùng trên điện thoại dưới dạng PWA.

> Hiện trạng: repo mới chỉ có `index.html` chào mừng (trang thử Vercel). Khi bắt đầu code thật, khởi tạo theo mục 2 và thay trang này.

## 1. Nguyên tắc làm việc

- **Hỏi khi chưa rõ.** Nêu giả định; nếu có nhiều cách hiểu, trình bày ra thay vì tự chọn.
- **Tối giản.** Chỉ làm đúng yêu cầu, không thêm tính năng/abstraction/cấu hình "phòng khi cần".
- **Sửa đúng chỗ.** Không tự refactor, đổi format code không liên quan. Thấy code chết thì báo, đừng xoá.
- **Có tiêu chí kiểm chứng.** Việc nhiều bước: nêu kế hoạch ngắn `bước → cách kiểm tra`. Xong phải chạy `npm run build` (và lint) không lỗi.
- **Giao diện và thông báo bằng tiếng Việt**; tên bảng/cột/biến/hàm bằng tiếng Anh.

## 2. Kiến trúc & công nghệ

```
VS Code (Claude Code) → GitHub (main) → Vercel (tự build & deploy) → Supabase
```

- **Frontend:** React + TypeScript + Vite + Tailwind CSS, PWA bằng `vite-plugin-pwa` (chiến lược `injectManifest` để tự viết xử lý `push` trong service worker).
- **Backend:** Supabase – Postgres + RLS, Auth, Realtime, Storage, Edge Functions (Deno), `pg_cron`.
- **Bản đồ:** Google Maps JavaScript API (chỉ tải ở trang bản đồ của quản lý).
- **Hosting:** Vercel. SPA cần `vercel.json` rewrite mọi đường dẫn về `/index.html`. Mỗi push lên `main` là deploy production; nhánh khác là preview.

Cấu trúc thư mục:
```
src/
  lib/            supabase.ts, compressImage.ts, time.ts
  features/       auth/ tasks/ chat/ notifications/ map/
  pages/          route-level components (lazy import)
  sw.ts           service worker (precache + push)
supabase/
  migrations/     mọi thay đổi schema/RLS/trigger/cron
  functions/      traccar-ingest/ notify/ telegram-webhook/
```

Lệnh: `npm run dev` · `npm run build` · `npm run lint` · `supabase migration new <tên>` · `supabase db push` · `supabase functions deploy <tên>` · `supabase gen types typescript --linked > src/types/database.ts`

## 3. Bảo mật & bí mật

- **Không bao giờ commit `.env*`** (trừ `.env.example`). Kiểm tra `.gitignore` trước khi commit.
- Biến có tiền tố `VITE_` lộ ra trình duyệt → chỉ dùng cho giá trị công khai: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_MAPS_API_KEY` (giới hạn theo domain), `VITE_VAPID_PUBLIC_KEY`. Khai báo trong Vercel → Project Settings → Environment Variables.
- Bí mật chỉ nằm trong `supabase secrets set`: `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `VAPID_PRIVATE_KEY`. Không bao giờ dùng service role ở frontend.
- **Phân quyền thực thi ở database (RLS + trigger)**, giao diện chỉ ẩn/hiện cho tiện. Mọi bảng mới phải `enable row level security` kèm policy ngay trong cùng migration.
- Schema chỉ thay đổi qua file trong `supabase/migrations/`. Nếu chạy tay trong SQL Editor thì vẫn phải lưu lại thành migration.

## 4. Vai trò & phân quyền

Hai vai trò trong `profiles.role`: `manager` | `staff`. **Một nhân viên có thể thuộc nhiều nhóm**: bảng `team_members (team_id, user_id)`; `teams.manager_id` là quản lý phụ trách. Gỡ nhân viên khỏi nhóm → trigger tự gỡ họ khỏi các việc **chưa hoàn thành** của nhóm đó.

Hàm SQL dùng chung (`security definer`, `stable`): `my_role()` (không đặt tên `current_role` – trùng từ khoá Postgres), `is_manager()`, `manages_user(uid)` (true nếu người gọi quản lý **bất kỳ** nhóm nào có `uid`), `task_team_has_member(task, uid)` (người được giao phải thuộc đúng nhóm của việc). Dùng các hàm này trong policy, tránh policy tự query lại bảng `profiles` gây đệ quy.

| Dữ liệu | Quản lý | Nhân viên |
|---|---|---|
| Công việc | Tạo/sửa/xoá/giao việc trong team mình | Chỉ **xem** việc giao cho mình; chỉ được đổi `status` |
| Bình luận/ảnh báo cáo | Xem & viết trên việc của team | Xem & viết trên việc của mình |
| Chat | Thành viên của cuộc trò chuyện | Thành viên của cuộc trò chuyện |
| Vị trí | Toàn bộ nhân viên trong team mình phụ trách | **Không** xem được vị trí người khác |

## 5. Công việc (danh sách + Kanban)

- Bảng `tasks`: `id, team_id, title, description, status, created_by, due_at, created_at, updated_at`.
- **Một việc giao được cho nhiều nhân viên**, quản lý thêm/bớt người bất cứ lúc nào: bảng `task_assignees (task_id, user_id, assigned_by, assigned_at)`, khoá chính `(task_id, user_id)`. Nhân viên bị gỡ khỏi việc mất quyền xem ngay (RLS dựa trên `task_assignees`); bình luận cũ của họ vẫn giữ.
- `status` là enum 4 giá trị, hiển thị: `todo` = Chưa làm · `in_progress` = Đang làm · `paused` = Tạm dừng · `done` = Hoàn thành. Trạng thái là **chung cho cả việc**: bất kỳ người được giao nào đổi thì mọi người cùng thấy.
- Quy tắc trạng thái (thực thi bằng trigger `BEFORE UPDATE`, không chỉ ở UI):
  - Việc mới tạo là `todo`. Giao/đổi người **không** làm đổi trạng thái: việc vẫn nằm ở cột Chưa làm cho tới khi nhân viên bấm "Đang làm".
  - Nhân viên được giao: `todo → in_progress`, `in_progress ↔ paused`, `in_progress | paused → done`. Không được chuyển về `todo`, không mở lại việc `done`, không sửa cột nào khác ngoài `status` (trigger báo lỗi nếu cột khác thay đổi).
  - Quản lý: mọi chuyển đổi, kể cả mở lại việc `done`.
- **Danh sách = bảng có phân trang** (số trang, 10/20/50 dòng), lọc trạng thái và đếm số lượng ở server (`useTaskPage`). Màn hình < 768px mỗi dòng hiển thị thành thẻ. **Kanban** 4 cột, tải dần (`useTasks`); trên điện thoại các cột cuộn ngang có snap. Đổi trạng thái bằng nút (kéo-thả chỉ là phụ, cho desktop). Cả hai dùng chung `TASK_SELECT` và `setTaskStatus` trong `features/tasks/api.ts`.
- Đổi trạng thái dùng optimistic update, lỗi thì hoàn tác và báo người dùng.
- Báo cáo kết quả: `task_comments (id, task_id, author_id, parent_id, body, created_at)` + `task_attachments (id, task_id, comment_id, storage_path, width, height, size_bytes)`.
- **Trả lời bình luận chỉ 1 cấp**: `parent_id` luôn trỏ tới bình luận gốc (trigger tự quy về gốc nếu trả lời một câu trả lời). Bình luận gốc phân trang theo cursor (20/lần); câu trả lời tải kèm theo các bình luận gốc đang hiển thị.

## 6. Chat nội bộ

- Bảng: `conversations (id, type: direct|group, name)`, `conversation_members (conversation_id, user_id, last_read_at)`, `messages (id, conversation_id, sender_id, body, image_path, created_at)`.
- RLS: chỉ thành viên mới đọc/gửi tin; `sender_id` phải bằng `auth.uid()`.
- Realtime: subscribe `postgres_changes` trên `messages` lọc theo `conversation_id` (Realtime tuân theo RLS). Huỷ subscribe khi rời màn hình.
- Tải tin theo cursor (`created_at < x`, 30 tin/lần), cuộn lên để tải thêm. Chưa đọc = tin có `created_at > last_read_at`.
- Chat **không** gửi qua Telegram.

## 7. Thông báo giao việc (Web + Telegram)

Luồng: trigger `AFTER INSERT` trên `task_assignees` (chỉ người **mới được thêm** nhận thông báo, người đã có sẵn thì không) → insert `notifications (id, user_id, task_id, title, read_at, push_status, telegram_status)` → Database Webhook gọi Edge Function `notify` → gửi Web Push + Telegram.

- **Không bao giờ để thông báo làm chặn hoặc rollback việc giao việc.** Lỗi gửi chỉ ghi vào `push_status`/`telegram_status`.
- **Trong app:** subscribe Realtime bảng `notifications` của user → toast + badge.
- **Web Push:** VAPID, bảng `push_subscriptions (user_id, endpoint, p256dh, auth)`. Khi push trả 404/410 thì xoá subscription. Trên iPhone, Web Push chỉ chạy khi đã **"Thêm vào màn hình chính"** (iOS 16.4+) → UI phải hướng dẫn.
- **Telegram:**
  - Liên kết tài khoản: app tạo token dùng một lần (hết hạn 15 phút) → mở `https://t.me/<bot>?start=<token>` → Edge Function `telegram-webhook` lưu `profiles.telegram_chat_id`. Webhook phải kiểm tra header `X-Telegram-Bot-Api-Secret-Token`.
  - Nội dung chỉ gồm: "Bạn được giao việc: <tiêu đề>" + link mở việc trong app. Không gửi mô tả chi tiết, bình luận, ảnh.
  - Bot trả 403 (người dùng chặn bot) → xoá `telegram_chat_id`. Gặp 429 → chờ `retry_after` rồi thử lại một lần.

## 8. Định vị bằng Traccar → Supabase

- Mỗi nhân viên cài **Traccar Client**, cấu hình:
  - Server URL: `https://<project>.supabase.co/functions/v1/traccar-ingest`
  - Device identifier: chuỗi ngẫu nhiên ≥ 16 ký tự do quản lý cấp (không dùng số điện thoại), lưu ở `devices (traccar_id unique, user_id)`.
  - Tiết kiệm pin: Frequency **60 s**, Distance **0**, Angle **0**, Location accuracy **Medium**, bật Offline buffering.
- Edge Function `traccar-ingest` (deploy với `--no-verify-jwt` vì Traccar Client không gửi JWT):
  - Chấp nhận cả kiểu OsmAnd (query/form: `id, lat, lon, timestamp, speed, bearing, accuracy, batt`) và JSON body của Traccar Client bản mới (`device_id`, `location.coords.*`, `location.battery.level`).
  - `traccar_id` không tồn tại → bỏ qua. Bỏ điểm có `accuracy > 200 m`.
  - **Giới hạn 60 s phía server:** bỏ qua điểm cách điểm trước của cùng nhân viên < 55 s. Điểm bị bỏ vẫn trả **200** để Traccar Client không gửi lại mãi.
  - Insert vào `locations (id, user_id, recorded_at, lat, lon, accuracy, speed, battery)` (index `(user_id, recorded_at desc)`) và upsert `last_locations` (1 dòng/nhân viên) để vẽ bản đồ nhanh.
- Lưu trữ **30 ngày**: `pg_cron` chạy mỗi đêm `delete from locations where recorded_at < now() - interval '30 days'`.
- RLS `locations`/`last_locations`: chỉ insert qua service role trong function; `select` khi `manages_user(user_id)` hoặc `user_id = auth.uid()`.
- Bản đồ của quản lý: marker từ `last_locations` + Realtime; xem lộ trình theo ngày (mỗi truy vấn tối đa 24 h). Nhân viên không có trang bản đồ của người khác.

## 9. Ảnh tải lên – luôn nén trước khi upload

- Mọi chỗ upload (bình luận, chat, avatar) dùng chung `src/lib/compressImage.ts`; **không bao giờ upload file gốc**.
- Cạnh dài tối đa **1280 px**, xuất **WebP chất lượng 0.7**. Nếu trình duyệt không ra được WebP thì dùng JPEG 0.75. Mục tiêu ≤ 300 KB; nếu vượt thì giảm chất lượng từng bước (tối thiểu 0.5).
- Đọc ảnh bằng `createImageBitmap(file, { imageOrientation: 'from-image' })` để giữ đúng chiều xoay. Vẽ lại qua canvas để loại bỏ EXIF (có GPS).
- Phía server: bucket **private**, `file_size_limit` 1 MB, `allowed_mime_types` `image/webp, image/jpeg`. Đường dẫn `tasks/{task_id}/…`, `chat/{conversation_id}/…`, policy Storage theo đúng quyền của mục 4. Hiển thị bằng signed URL và `loading="lazy"`.

## 10. PWA & giao diện điện thoại

- Thiết kế mobile-first (từ < 768 px trở lên). Vùng chạm ≥ 48 px, không cuộn ngang trang, tôn trọng `env(safe-area-inset-*)`. Nhân viên dùng thanh điều hướng dưới: Việc của tôi · Chat · Thông báo · Tài khoản.
- Manifest: tên, icon 192/512 + maskable, `display: standalone`, `theme_color`, `start_url: /`.
- Service worker: precache app shell + asset tĩnh; **không cache response API/Auth của Supabase**. Có thông báo "Có phiên bản mới – Tải lại".
- Route-based code splitting; Google Maps và trang quản lý chỉ tải khi mở. Có skeleton khi tải và nút "Thử lại" khi lỗi mạng; không để màn hình trắng.

## 11. Thời gian

Lưu `timestamptz` (UTC) trong DB. Chỉ đổi sang giờ `Asia/Ho_Chi_Minh` khi hiển thị, qua helper trong `src/lib/time.ts`.

## 12. Deploy

- Trước khi push: `npm run build` và `npm run lint` không lỗi. Có migration mới thì `supabase db push` trước khi deploy code dùng tới nó.
- Thêm domain Vercel (production + `*.vercel.app` cho preview) vào Supabase → Authentication → URL Configuration.
- Commit nhỏ, message rõ ràng. Chỉ commit/push khi người dùng yêu cầu.
