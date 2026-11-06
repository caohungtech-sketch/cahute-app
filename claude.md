# CLAUDE.md – Cahute App

Web app giao nhận việc cho đội nhân viên hiện trường: danh sách + Kanban, chat nội bộ, thông báo giao việc qua Web Push và Telegram, ghi vị trí nhân viên khi đổi trạng thái việc. Nhân viên dùng trên điện thoại dưới dạng PWA.

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
  - Dữ liệu: **TanStack Query** (`src/lib/queryClient.ts`); mọi truy vấn danh sách việc nằm dưới khoá `['tasks']`. Trang mới tải dữ liệu bằng `useQuery`, không tự `useEffect` + `setState`.
  - Giao diện quản lý: **shadcn/ui** trong `src/components/shadcn/` (màu khai báo trong `src/index.css`); hộp thoại dùng `ResponsiveDialog` (máy tính: Dialog, điện thoại: Drawer).
  - Giao diện nhân viên: **Konsta UI** kiểu iOS cho mọi máy, chỉ dùng trong `Layout.tsx` và `src/staff/` (tải riêng, quản lý không tải). Nhân viên có trang riêng cho Việc, Chi tiết việc, Tài khoản (`App.tsx` chọn theo vai trò); logic dữ liệu dùng chung trong `features/`.
  - Lint: **Oxlint** (`.oxlintrc.json`), vì typescript-eslint chưa hỗ trợ TypeScript 7.
- **Backend:** Supabase – Postgres + RLS, Auth, Realtime, Storage, Edge Functions (Deno), `pg_cron`.
- **Bản đồ:** Leaflet + dữ liệu OpenStreetMap, ô bản đồ từ CARTO (miễn phí, không cần API key; chỉ tải ở trang Tổng quan của quản lý). **Không dùng tên miền `openstreetmap.org`**: DNS của VNPT không phân giải được (xem `docs/location.md`).
- **Hosting:** Vercel. SPA cần `vercel.json` rewrite mọi đường dẫn về `/index.html`. Mỗi push lên `main` là deploy production; nhánh khác là preview.

Cấu trúc thư mục:
```
src/
  auth/           AuthProvider (phiên đăng nhập, hồ sơ, dự án đang quản lý)
  components/     Layout (nhân viên), ManagerLayout, ui.tsx, ResponsiveDialog, shadcn/
  features/       tasks/ map/   (chat/ notifications/: chưa có giao diện)
  lib/            supabase.ts, queryClient.ts, compressImage.ts, time.ts, …
  pages/          trang của quản lý + trang dùng chung (lazy import)
  staff/          trang của nhân viên (Konsta UI)
  sw.ts           service worker (precache + push)
supabase/
  migrations/     mọi thay đổi schema/RLS/trigger/cron
  functions/      notify/ telegram-webhook/   (chưa có thư mục này)
docs/             đặc tả chi tiết của từng tính năng lớn
```

Lệnh: `npm run dev` · `npm run build` · `npm run lint` · `supabase migration new <tên>` · `supabase db push` · `supabase functions deploy <tên>` · `supabase gen types typescript --linked > src/types/database.ts`

## 3. Màu sắc & giao diện (Design System)

Phong cách hiện đại lấy cảm hứng từ Bitrix24:
- **Màu chủ đạo – xanh tím đậm** (`indigo-900`/`purple-900`/`slate-900` hoặc độ sâu tương đương): nền Sidebar, thanh công cụ hệ thống, vùng nhận diện thương hiệu.
- **Nền trắng & xám sáng** (`bg-white`, `bg-gray-50`, `bg-gray-100`): vùng nội dung chính và bảng dữ liệu.
- **Điểm nhấn – xanh lá** (`bg-green-600` hoặc `emerald-500`): nút hành động chính, nút tạo mới (ví dụ `+ Tạo`).
- **Huy hiệu/nhãn** (nền nhạt, ví dụ `bg-yellow-50 text-yellow-800`): nhãn vai trò (*Người quản lý dự án*), trạng thái dữ liệu.

## 4. Bảo mật & bí mật

- **Không bao giờ commit `.env*`** (trừ `.env.example`). Kiểm tra `.gitignore` trước khi commit.
- Biến có tiền tố `VITE_` lộ ra trình duyệt → chỉ dùng cho giá trị công khai: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`. Khai báo trong Vercel → Project Settings → Environment Variables.
- Bí mật chỉ nằm trong `supabase secrets set`: `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `VAPID_PRIVATE_KEY`. Không bao giờ dùng service role ở frontend.
- **Phân quyền thực thi ở database (RLS + trigger)**, giao diện chỉ ẩn/hiện cho tiện. Mọi bảng mới phải `enable row level security` kèm policy ngay trong cùng migration.
- Schema chỉ thay đổi qua file trong `supabase/migrations/`. Nếu chạy tay trong SQL Editor thì vẫn phải lưu lại thành migration.

## 5. Vai trò & phân quyền

- Hai vai trò trong `profiles.role`: `manager` | `staff`. ("Dự án" trước đây gọi là "Nhóm", đổi tên ở migration 0012.)
- **Một nhân viên có thể thuộc nhiều dự án**: bảng `project_members (project_id, user_id)`.
- **Một dự án có 1 hoặc nhiều quản lý**: bảng `project_managers (project_id, user_id)`, các quản lý của dự án có quyền ngang nhau; chỉ tài khoản `manager` mới được thêm làm quản lý dự án; người tạo dự án tự động là quản lý; dự án luôn còn ít nhất 1 quản lý (trigger).
- Người đăng ký đầu tiên là quản lý; sau đó **quản lý nào cũng nâng/hạ quyền được người khác** (trang Nhân viên `/staff`, không có cấp admin; tạo/sửa/xoá dự án và thành viên ở trang Dự án `/projects`).
- Trigger `profiles_guard` chặn tự hạ quyền mình, giữ ít nhất 1 quản lý, và khi hạ quyền một quản lý thì chuyển các dự án của họ cho người thực hiện.
- Gỡ nhân viên khỏi dự án → trigger tự gỡ họ khỏi các việc **chưa hoàn thành** của dự án đó.

Hàm SQL dùng chung (`security definer`, `stable`): `my_role()` (không đặt tên `current_role` – trùng từ khoá Postgres), `is_manager()`, `manages_user(uid)` (true nếu người gọi quản lý **bất kỳ** dự án nào có `uid`), `task_project_has_member(task, uid)` (người được giao phải thuộc đúng dự án của việc). Dùng các hàm này trong policy, tránh policy tự query lại bảng `profiles` gây đệ quy.

| Dữ liệu | Quản lý | Nhân viên |
|---|---|---|
| Công việc | Tạo/sửa/xoá/giao việc trong dự án mình | Chỉ **xem** việc giao cho mình; chỉ được đổi `status` |
| Bình luận/ảnh báo cáo | Xem & viết trên việc của dự án | Xem & viết trên việc của mình |
| Chat | Thành viên của cuộc trò chuyện | Thành viên của cuộc trò chuyện |
| Vị trí & lịch sử trạng thái | Nhân viên/việc trong dự án mình phụ trách | Chỉ của mình; **không** xem được vị trí người khác |

## 6. Công việc (danh sách + Kanban)

- Bảng `tasks`: `id, project_id, title, description, status, result, created_by, due_at, created_at, updated_at`. `result` (Kết quả) do nhân viên được giao hoặc quản lý ghi.
- Trang chi tiết **sửa trực tiếp** (không có trang sửa riêng): quản lý sửa tiêu đề/mô tả/hạn/kết quả, nhân viên được giao chỉ sửa kết quả; nút Lưu chỉ hiện khi có thay đổi. Người làm hiển thị dạng **chip** (quản lý: × gỡ, "+ Thêm người" trong dự án của việc).
- **Một việc giao được cho nhiều nhân viên**, quản lý thêm/bớt người bất cứ lúc nào: bảng `task_assignees (task_id, user_id, assigned_by, assigned_at)`, khoá chính `(task_id, user_id)`. Nhân viên bị gỡ khỏi việc mất quyền xem ngay (RLS dựa trên `task_assignees`); bình luận cũ của họ vẫn giữ.
- `status` là enum 4 giá trị, hiển thị: `todo` = Chưa làm · `in_progress` = Đang làm · `paused` = Tạm dừng · `done` = Hoàn thành. Trạng thái là **chung cho cả việc**: bất kỳ người được giao nào đổi thì mọi người cùng thấy.
- Quy tắc trạng thái (thực thi bằng trigger `BEFORE UPDATE`, không chỉ ở UI):
  - Việc mới tạo là `todo`. Giao/đổi người **không** làm đổi trạng thái: việc vẫn nằm ở cột Chưa làm cho tới khi nhân viên bấm "Đang làm".
  - Nhân viên được giao: `todo → in_progress`, `in_progress ↔ paused`, `in_progress | paused → done`. Không được chuyển về `todo`, không mở lại việc `done`, không sửa cột nào khác ngoài `status` và `result` (trigger báo lỗi nếu cột khác thay đổi).
  - Quản lý: mọi chuyển đổi, kể cả mở lại việc `done`.
- **Danh sách = bảng có phân trang** (số trang, 10/20/50 dòng), lọc trạng thái và đếm số lượng ở server (`useTaskPage`). Desktop có thêm **Kanban** 4 cột, tải dần (`useTasks`). Đổi trạng thái bằng nút (kéo-thả chỉ là phụ, cho desktop). Cả hai dùng chung `TASK_SELECT` và `setTaskStatus` trong `features/tasks/api.ts`.
- **Điện thoại (< 768px, `useIsMobile`)**: không có Kanban, chỉ danh sách; ô **tìm nhanh autocomplete** (theo tiêu đề, `QuickSearch`) phía trên; 4 tab trạng thái chia đều một hàng Chưa làm (mặc định) · Đang làm · Tạm dừng · Hoàn thành, **không có tab Tất cả**; mỗi tab 20 việc/trang, chỉ hiện nút chuyển trang khi > 20; kích thước gọn (tab/nút cao 40px). Ô nhập luôn ≥ 16px chữ để iOS không tự phóng to.
  - Quản lý: danh sách thẻ trong `TaskTableView`.
  - Nhân viên: trang riêng `src/staff/StaffTasksPage.tsx` (Konsta UI, cùng quy tắc trên); việc có 1 bước tiếp theo thì bấm là đổi luôn, nhiều bước thì mở bảng chọn trượt từ đáy (`StatusSheet`).
- Đổi trạng thái dùng optimistic update, lỗi thì hoàn tác và báo người dùng.
- Báo cáo kết quả: `task_comments (id, task_id, author_id, parent_id, body, created_at)` + `task_attachments (id, task_id, comment_id, storage_path, width, height, size_bytes)`.
- **Trả lời bình luận chỉ 1 cấp**: `parent_id` luôn trỏ tới bình luận gốc (trigger tự quy về gốc nếu trả lời một câu trả lời). Bình luận gốc phân trang theo cursor (20/lần); câu trả lời tải kèm theo các bình luận gốc đang hiển thị.

## 7. Chat nội bộ

- Bảng: `conversations (id, type: direct|group, name)`, `conversation_members (conversation_id, user_id, last_read_at)`, `messages (id, conversation_id, sender_id, body, image_path, created_at)`.
- RLS: chỉ thành viên mới đọc/gửi tin; `sender_id` phải bằng `auth.uid()`.
- Realtime: subscribe `postgres_changes` trên `messages` lọc theo `conversation_id` (Realtime tuân theo RLS). Huỷ subscribe khi rời màn hình.
- Tải tin theo cursor (`created_at < x`, 30 tin/lần), cuộn lên để tải thêm. Chưa đọc = tin có `created_at > last_read_at`.
- Chat **không** gửi qua Telegram.
- Hiện trạng: đã có bảng trong DB (migration 0002); chưa có giao diện (menu "Tin nhắn" của quản lý đang là trang "sắp ra mắt").

## 8. Thông báo giao việc (Web Push + Telegram)

Chỉ người **mới được thêm** vào việc nhận thông báo (trigger `AFTER INSERT` trên `task_assignees` → bảng `notifications` → Edge Function `notify`). **Không bao giờ để thông báo làm chặn hoặc rollback việc giao việc.** Hiện trạng: đã có bảng trong DB (migration 0003); chưa có Edge Function `notify`/`telegram-webhook` và giao diện. Đặc tả đầy đủ: **`docs/notifications.md`** – đọc trước khi làm.

## 9. Vị trí nhân viên (ghi khi đổi trạng thái)

Không theo dõi liên tục: khi nhân viên bấm đổi trạng thái việc, app lấy vị trí **một lần** và gửi qua RPC `set_task_status`; DB tự ghi lịch sử mọi lần đổi trạng thái vào `task_status_events` và cập nhật `last_locations`. **Không bao giờ chặn việc đổi trạng thái vì không lấy được vị trí.** Toạ độ tự xoá sau 30 ngày. Quản lý xem trên bản đồ Leaflet + OSM (trang Tổng quan) và mục "Lịch sử trạng thái" (chi tiết việc). Đã bỏ Traccar (migration 0015). Đặc tả đầy đủ: **`docs/location.md`** – đọc trước khi sửa.

## 10. Ảnh tải lên – luôn nén trước khi upload

- Mọi chỗ upload (bình luận, chat, avatar) dùng chung `src/lib/compressImage.ts`; **không bao giờ upload file gốc**.
- Cạnh dài tối đa **1280 px**, xuất **WebP chất lượng 0.7**. Nếu trình duyệt không ra được WebP thì dùng JPEG 0.75. Mục tiêu ≤ 300 KB; nếu vượt thì giảm chất lượng từng bước (tối thiểu 0.5).
- Đọc ảnh bằng `createImageBitmap(file, { imageOrientation: 'from-image' })` để giữ đúng chiều xoay. Vẽ lại qua canvas để loại bỏ EXIF (có GPS).
- Phía server: bucket **private**, `file_size_limit` 1 MB, `allowed_mime_types` `image/webp, image/jpeg`. Đường dẫn `tasks/{task_id}/…`, `chat/{conversation_id}/…`, policy Storage theo đúng quyền của mục 5. Hiển thị bằng signed URL và `loading="lazy"`.

## 11. PWA & giao diện điện thoại

- Thiết kế mobile-first (từ < 768 px trở lên), không cuộn ngang trang.
- **Vùng chạm:** nút hành động chính ≥ 48 px; nút/tab gọn trong danh sách điện thoại ≥ 40 px (mục 6). Với Konsta: nút chính dùng `large` (48 px); **không** dùng nút `small` (28 px) hay cỡ mặc định (34 px) mà không tăng chiều cao (ví dụ `!h-10`).
- **Vùng tai thỏ/thanh home (`safe-area`):** trang quản lý tự dùng `env(safe-area-inset-*)`; trang nhân viên để Navbar/Tabbar của Konsta tự xử lý, **không** thêm `env()` lần nữa.
- Nhân viên dùng thanh điều hướng dưới: Công việc · Chat · Thông báo · Tài khoản (hiện mới có Công việc · Tài khoản).
- **Konsta – tránh lỗi đã gặp:**
  - Thứ tự lớp: thanh tab `z-30` < bảng chọn/hộp thoại/popup của Konsta `z-40` < toast `z-50`. Không đặt thanh tab ngang hoặc cao hơn `z-40` (sẽ che nút Huỷ và lớp nền tối).
  - Khối (`Block`/`List`) nằm ngay sau `BlockTitle` giữ lề mặc định của Konsta, không thu lề `my-*` (tiêu đề sẽ bị khối đè lên).
- Manifest: tên, icon 192/512 + maskable, `display: standalone`, `theme_color`, `start_url: /`.
- Service worker: precache app shell + asset tĩnh; **không cache response API/Auth của Supabase**. Có thông báo "Có phiên bản mới – Tải lại".
- Route-based code splitting; bản đồ (Leaflet) và trang quản lý chỉ tải khi mở. Có skeleton khi tải và nút "Thử lại" khi lỗi mạng; không để màn hình trắng.

## 12. Thời gian

Lưu `timestamptz` (UTC) trong DB. Chỉ đổi sang giờ `Asia/Ho_Chi_Minh` khi hiển thị, qua helper trong `src/lib/time.ts`.

## 13. Deploy

- Trước khi push: `npm run build` và `npm run lint` không lỗi. Có migration mới thì `supabase db push` trước khi deploy code dùng tới nó.
- Thêm domain Vercel (production + `*.vercel.app` cho preview) vào Supabase → Authentication → URL Configuration.
- Commit nhỏ, message rõ ràng. Chỉ commit/push khi người dùng yêu cầu.
