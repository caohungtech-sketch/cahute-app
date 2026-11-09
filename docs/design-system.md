# Design System – Cahute

> Quy ước giao diện, ghi lại theo đúng những gì code **đang dùng** (quét 09/11/2026). Liên quan CLAUDE.md mục 4 (tóm tắt) và mục 12 (PWA).
> Làm giao diện mới: dùng lại class/component có sẵn ở mục 6 trước khi tự viết. Muốn đổi quy ước thì sửa file này trước.

## 1. Hai bộ giao diện

| | Quản lý | Nhân viên |
|---|---|---|
| Thư viện | Tailwind + **shadcn/ui** (`src/components/shadcn/`, kiểu `new-york`) + class trong `src/components/ui.tsx` | **Konsta UI** kiểu iOS cho mọi máy |
| Phạm vi | `ManagerLayout.tsx`, `src/pages/`, `src/features/` | Chỉ trong `Layout.tsx` và `src/staff/` (tải riêng, quản lý không tải) |
| Khung trang | Sidebar trái (máy tính, thu gọn được) / ngăn kéo (điện thoại) | Navbar trên + Tabbar dưới của Konsta |
| Hộp thoại | `ResponsiveDialog` (máy tính: Dialog, điện thoại: Drawer) | `Actions` (bảng chọn trượt từ đáy), ví dụ `StatusSheet` |

Phong cách chung: hiện đại, lấy cảm hứng từ Bitrix24.

## 2. Màu sắc

### 2.1 Vai trò của từng màu

| Vai trò | Màu | Dùng cho |
|---|---|---|
| **Chủ đạo** – xanh tím đậm | `bg-indigo-950`, chữ `text-indigo-100/200/300` | Sidebar, vùng nhận diện thương hiệu. Logo: ô `from-indigo-400 to-violet-600` |
| **Nền** – trắng & xám sáng | thân trang `#f5f7fa`; thẻ `bg-white`; `bg-gray-50/100` | Nội dung chính, bảng dữ liệu |
| **Hành động chính** – xanh lá | `bg-green-600`, bấm `active:bg-green-700` | Nút chính, nút tạo mới (`+ Tạo`). Cả shadcn (`--primary`) và Konsta (`--k-color-primary`) đều đã ép sang green-600 |
| **Tương tác phụ** – indigo | `indigo-50…800` | Liên kết, viền ô nhập khi focus, tab/trang đang chọn, dòng được chọn, chip người làm, spinner |
| **Nhãn/huy hiệu** – nền nhạt | `bg-yellow-50 text-yellow-800 ring-yellow-200` | Nhãn vai trò *Quản lý* / *Người quản lý dự án* |
| **Nguy hiểm** | `text-red-700 ring-red-300`, `bg-red-50`; shadcn `--destructive` = red-600 | Nút xoá, hộp báo lỗi |

**Không dùng `blue-*`** cho giao diện. Xanh dương chỉ là màu trạng thái *Đang làm* và màu biểu đồ.

### 2.2 Màu trạng thái việc

Một nguồn duy nhất: `STATUS_STYLE` trong `src/lib/taskStatus.ts`, hiển thị bằng `StatusBadge`.

| Trạng thái | Huy hiệu | Biểu đồ (`--chart-*` trong `index.css`) |
|---|---|---|
| Chưa làm | `bg-gray-100 text-gray-700` | xám `#6b7280` (tối `#7c8799`) |
| Đang làm | `bg-blue-100 text-blue-800` | xanh dương `#2563eb` (tối `#3b82f6`) |
| Tạm dừng | `bg-amber-100 text-amber-800` | vàng cam `#d97706` (cả hai chế độ) |
| Hoàn thành | `bg-green-100 text-green-800` | xanh lá `#15803d` (tối `#16a34a`) |

**Quy tắc: cùng một trạng thái thì cùng sắc màu** ở huy hiệu, ô thống kê và biểu đồ (huy hiệu dùng nền nhạt, biểu đồ dùng màu đậm). Ba màu việc đang mở (xám, xanh dương, vàng cam) đã chạy kiểm tra độ phân biệt cho người mù màu trên nền sáng và nền tối; xám thiếu độ đậm màu là chủ ý vì "Chưa làm" là trạng thái trung tính. Biểu đồ luôn kèm chú thích tên + số lượng, không phân biệt chỉ bằng màu. Thêm hay đổi màu trạng thái thì sửa cả `STATUS_STYLE` và `--chart-*`.

### 2.3 Chế độ tối

- Bật bằng class `dark` trên `<html>` (`src/lib/theme.ts`, lưu trong `localStorage`; script trong `index.html` đặt class trước khi vẽ để không nháy).
- `index.css` **đảo thang `gray-*`** và đổi nền `bg-white` → `#1b2638`, thân trang → `#111a2b`.
- **Quy ước:** bề mặt/chữ/viền dùng `white` + `gray-*` thì tự đổi theo chế độ, **không cần thêm `dark:`**. Màu nhấn (green, indigo, blue, amber…) giữ nguyên ở cả hai chế độ.
- Ngoại lệ: `bg-gray-900` (toast) giữ nền tối ở cả hai chế độ.

## 3. Chữ

- Font hệ thống: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Màu chữ chính `#1f2937` (gray-800).
- Thang cỡ chữ đang dùng:

| Loại | Class |
|---|---|
| Tiêu đề trang (`h1`) | `text-xl font-bold`, máy tính `md:text-2xl` |
| Tiêu đề màn hình đăng nhập / đổi mật khẩu | `text-2xl font-bold` |
| Tiêu đề mục/thẻ (`h2`) | `text-base font-semibold` (mục lớn như Bình luận: `text-lg`) |
| Chữ thường trong bảng, danh sách, nút phụ | `text-sm` (phổ biến nhất) |
| Chữ phụ, huy hiệu, thời gian | `text-xs`, màu `text-gray-500` |
| Ô nhập | `text-base` – **luôn ≥ 16px** để iOS không tự phóng to |

- Độ đậm: `font-medium` (nút, nhãn) · `font-semibold` (tiêu đề mục, nút chính) · `font-bold` (tiêu đề trang). Số đếm/giờ dùng `tabular-nums`.

## 4. Hình khối & khoảng cách

| Thành phần | Class |
|---|---|
| Nút, ô nhập, thẻ, toast | `rounded-xl` |
| Thẻ lớn (trang Tổng quan, Dự án) | `rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5` |
| Thẻ thường | `rounded-xl bg-white p-4 ring-1 ring-gray-200` |
| Nút nhỏ trong thanh công cụ, nút icon | `rounded-lg` |
| Chip, huy hiệu, nhãn | `rounded-full` |
| Menu thả xuống | `rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200` |

- Viền dùng `ring-1 ring-gray-200` (thẻ) / `border-gray-300` (ô nhập), không dùng `border` đậm.
- Lề trong thẻ: `p-4`, thẻ lớn trên máy tính `md:p-5`. Không cuộn ngang trang.

## 5. Vùng chạm & kích thước

- Nút hành động chính, ô nhập: **≥ 48px** (`min-h-12`).
- Nút/tab gọn trong danh sách điện thoại, mục menu: **≥ 40px** (`min-h-10`, `min-h-11`). Chip: `min-h-9`.
- Konsta: nút chính dùng `large` (48px); **không** dùng nút `small` (28px) hay cỡ mặc định (34px) mà không tăng chiều cao (ví dụ `!h-10`).
- Icon: thư viện **`lucide-react`**; `h-5 w-5` trong menu/nút lớn, `h-4 w-4` trong nút nhỏ/chữ. Icon trang trí thêm `aria-hidden`.

## 6. Component & class dùng chung

### Quản lý – `src/components/ui.tsx`

| Tên | Dùng khi |
|---|---|
| `btn.primary` | Nút chính, xanh lá, cao 48px |
| `btn.secondary` | Nút phụ, nền trắng viền xám |
| `btn.danger` | Nút xoá, chữ đỏ viền đỏ |
| `inputCls` | Mọi ô nhập: cao 48px, `text-base`, focus viền + vòng indigo |
| `StatusBadge` | Huy hiệu trạng thái việc |
| `Skeleton` | Khung xám nhấp nháy khi đang tải (không để màn hình trắng) |
| `ErrorBox` | Hộp lỗi đỏ nhạt + nút "Thử lại" |
| `Toast` | Thông báo ngắn ở đáy, tự tắt sau 4 giây, bấm để đóng |
| `FullScreenMessage` | Màn hình thông báo căn giữa |

shadcn đã cài: `button`, `dialog`, `drawer`, `table` (bảng `TaskDataTable` dùng shadcn `table` + TanStack Table). Cần component shadcn mới thì thêm vào `src/components/shadcn/`, màu lấy từ biến trong `index.css`, không ghi mã màu cứng.

Mẫu quen thuộc:
- **Chip người làm:** `rounded-full bg-indigo-50 text-indigo-900 ring-1 ring-indigo-200` (`AssigneeChips`).
- **Mục đang chọn:** sidebar `bg-white/15 text-white`; tab/menu trên nền sáng `bg-indigo-50 text-indigo-700`; dòng bảng được chọn `bg-indigo-50`.

### Nhân viên – Konsta UI

Đang dùng: `Navbar`, `NavbarBackLink`, `Tabbar`/`TabbarLink`, `Block`, `BlockTitle`, `List`, `ListItem`, `ListInput`, `Button`, `Segmented`/`SegmentedButton`, `Actions…` (bảng chọn). Toast dùng `StaffToast` (đẩy lên cao hơn thanh tab).

## 7. Konsta – tránh lỗi đã gặp

- **Thứ tự lớp:** thanh tab `z-30` < bảng chọn/hộp thoại/popup của Konsta `z-40` < toast `z-50`. Không đặt thanh tab ngang hoặc cao hơn `z-40` (sẽ che nút Huỷ và lớp nền tối).
- Khối (`Block`/`List`) nằm ngay sau `BlockTitle` giữ lề mặc định của Konsta, **không** thu lề `my-*` (tiêu đề sẽ bị khối đè lên).
- **Vùng tai thỏ/thanh home (`safe-area`):** trang quản lý tự dùng `env(safe-area-inset-*)`; trang nhân viên để Navbar/Tabbar của Konsta tự xử lý, **không** thêm `env()` lần nữa.
- iOS Safari: ô ngày/giờ đã được căn trái lại trong `index.css`, không cần sửa riêng từng chỗ.

## 8. Câu chữ

- Toàn bộ giao diện và thông báo bằng **tiếng Việt**, có dấu.
- Nhãn trạng thái và nút đổi trạng thái lấy từ `STATUS_LABEL` / `actionLabel` (`taskStatus.ts`): *Bắt đầu làm · Tạm dừng · Tiếp tục · Hoàn thành*.
- Đang tải: cả trang/danh sách dùng `Skeleton`; lúc mở app dùng spinner indigo (`App.tsx`); mục nhỏ có thể ghi chữ "Đang tải…" (ví dụ Lịch sử trạng thái). Lỗi mạng: câu báo lỗi + nút **"Thử lại"**.
- Bản cập nhật app: *"Có phiên bản mới – Tải lại"*.
