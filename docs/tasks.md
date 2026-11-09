# Công việc – danh sách, Kanban, chi tiết việc, báo cáo kết quả

> Đặc tả chi tiết, tách ra từ CLAUDE.md (mục 7). Đọc file này trước khi sửa phần công việc.
> Các spec mở rộng bảng `tasks` (khách hàng, bảng giá/hạng mục…) ghi phần mở rộng trong spec của mình và trỏ về file này, không chép lại.

## 1. Dữ liệu

- `tasks (id, project_id, title, description, status, result, created_by, due_at, created_at, updated_at)`. `result` (Kết quả) do nhân viên được giao hoặc quản lý ghi.
- **Một việc giao được cho nhiều nhân viên**, quản lý thêm/bớt người bất cứ lúc nào: `task_assignees (task_id, user_id, assigned_by, assigned_at)`, khoá chính `(task_id, user_id)`. Người được giao phải thuộc đúng dự án của việc (`task_project_has_member`). Nhân viên bị gỡ khỏi việc mất quyền xem ngay (RLS dựa trên `task_assignees`); bình luận cũ của họ vẫn giữ.
- Báo cáo kết quả: `task_comments (id, task_id, author_id, parent_id, body, created_at)` + `task_attachments (id, task_id, comment_id, storage_path, width, height, size_bytes)`. Ảnh: CLAUDE.md mục 11.

## 2. Trạng thái

- `status` là enum 4 giá trị, hiển thị: `todo` = Chưa làm · `in_progress` = Đang làm · `paused` = Tạm dừng · `done` = Hoàn thành. Trạng thái là **chung cho cả việc**: bất kỳ người được giao nào đổi thì mọi người cùng thấy.
- Quy tắc (thực thi bằng trigger `tasks_before_update` `BEFORE UPDATE`, không chỉ ở UI; phía giao diện khớp với `STAFF_TRANSITIONS` trong `src/lib/taskStatus.ts`):
  - Việc mới tạo là `todo`. Giao/đổi người **không** làm đổi trạng thái: việc vẫn nằm ở cột Chưa làm cho tới khi nhân viên bấm "Đang làm".
  - Nhân viên được giao: `todo → in_progress`, `in_progress ↔ paused`, `in_progress | paused → done`. Không được chuyển về `todo`, không mở lại việc `done`, không sửa cột nào khác ngoài `status` và `result` (trigger báo lỗi nếu cột khác thay đổi).
  - Quản lý: mọi chuyển đổi, kể cả mở lại việc `done`.
- Đổi trạng thái dùng **optimistic update**, lỗi thì hoàn tác và báo người dùng. Nhân viên đổi trạng thái thì kèm vị trí (CLAUDE.md mục 10, `docs/location.md`).

## 3. Danh sách & Kanban

- **Danh sách = bảng có phân trang** (số trang, 10/20/50 dòng), lọc trạng thái và đếm số lượng ở server (`useTaskPage`). Mọi truy vấn danh sách việc nằm dưới khoá TanStack Query `['tasks']`.
- Desktop có thêm **Kanban** 4 cột, tải dần (`useTasks`). Đổi trạng thái bằng nút (kéo-thả chỉ là phụ, cho desktop).
- Cả hai dùng chung `TASK_SELECT` và `setTaskStatus` trong `features/tasks/api.ts`.

### 3.1 Máy tính – Data Table

`TaskDataTable` (shadcn `table` + TanStack Table):
- Sắp xếp theo Công việc / Trạng thái / Hạn / Cập nhật.
- Lọc theo người làm và hạn (Quá hạn, Hôm nay, 7 ngày tới, Không có hạn, khoảng ngày).
- Sắp xếp và lọc đều làm **ở server** trong `useTaskPage`; số đếm ở tab cũng theo bộ lọc.
- Chọn nhiều dòng (chỉ việc thuộc dự án mình quản lý, trong trang đang xem) → `TaskBulkBar`: đổi trạng thái, giao thêm người, xoá.
- Điện thoại không có các tính năng này.

### 3.2 Điện thoại (< 768px, `useIsMobile`)

- Không có Kanban, chỉ danh sách.
- Ô **tìm nhanh autocomplete** theo tiêu đề (`QuickSearch`) phía trên.
- 4 tab trạng thái chia đều một hàng: Chưa làm (mặc định) · Đang làm · Tạm dừng · Hoàn thành, **không có tab Tất cả**.
- Mỗi tab 20 việc/trang, chỉ hiện nút chuyển trang khi > 20.
- Kích thước gọn: tab/nút cao 40px. Ô nhập luôn ≥ 16px chữ để iOS không tự phóng to.
- Quản lý: danh sách thẻ trong `TaskTableView`.
- Nhân viên: trang riêng `src/staff/StaffTasksPage.tsx` (Konsta UI, cùng quy tắc trên); việc có 1 bước tiếp theo thì bấm là đổi luôn, nhiều bước thì mở bảng chọn trượt từ đáy (`StatusSheet`).

## 4. Trang chi tiết việc

- **Sửa trực tiếp** ngay trên trang (không có trang sửa riêng): quản lý sửa tiêu đề/mô tả/hạn/kết quả, nhân viên được giao chỉ sửa kết quả; nút Lưu chỉ hiện khi có thay đổi.
- Người làm hiển thị dạng **chip** (`AssigneeChips`): quản lý có × để gỡ và "+ Thêm người" (chỉ người trong dự án của việc).
- Quản lý có thêm mục "Lịch sử trạng thái" (`StatusHistory`).

## 5. Bình luận

- **Trả lời chỉ 1 cấp**: `parent_id` luôn trỏ tới bình luận gốc (trigger tự quy về gốc nếu trả lời một câu trả lời).
- Bình luận gốc phân trang theo cursor (20/lần); câu trả lời tải kèm theo các bình luận gốc đang hiển thị.
