# Lộ trình thương mại hoá Cahute (SaaS nhiều khách hàng)

> Tài liệu định hướng, viết ngày 06/11/2026. Mô tả hướng phát triển để bán Cahute cho nhiều công ty khách hàng.
> Phần chi phí, gói cước và pháp lý là thông tin tham khảo: cần kiểm tra lại với nhà cung cấp và luật sư trước khi quyết định.

## 1. Mục tiêu

Một hệ thống Cahute dùng chung cho nhiều công ty khách hàng (mô hình SaaS):
- Mỗi công ty tự đăng ký, tự quản lý nhân viên, dự án, công việc của mình.
- Dữ liệu giữa các công ty **tách biệt tuyệt đối**.
- Thu phí theo gói, chủ yếu theo số nhân viên.
- Vận hành ổn định: sao lưu, giám sát lỗi, môi trường thử nghiệm riêng.

## 2. Hiện trạng và vấn đề

Cahute hiện được thiết kế cho **một công ty duy nhất**:

| Hiện trạng | Vấn đề khi có nhiều công ty |
|---|---|
| `profiles.role` (`manager`/`staff`) là vai trò **toàn hệ thống** | Quản lý của công ty A là quản lý trên toàn hệ thống |
| Người đăng ký đầu tiên là quản lý; quản lý nào cũng nâng/hạ quyền được người khác | Quản lý công ty A đổi được quyền nhân viên công ty B |
| Danh sách người dùng (`useProfiles`) tải **mọi người dùng** | Công ty A thấy tên nhân viên công ty B |
| Dự án, việc, chat, vị trí không gắn với công ty nào | Không có ranh giới dữ liệu giữa khách hàng |
| Dùng dịch vụ miễn phí: Supabase Free, ô bản đồ OpenStreetMap France (máy chủ cộng đồng) | Không có cam kết hoạt động; Supabase Free có thể tạm dừng project khi lâu không dùng |
| Lưu số CCCD và vị trí nhân viên | Dữ liệu cá nhân nhạy cảm, có yêu cầu pháp lý (đã quyết định bỏ CCCD, xem 3.3) |
| Quản lý nào cũng nâng/hạ quyền và xem hồ sơ mọi nhân viên | Không có cấp chủ doanh nghiệp; sau này quản lý sẽ xem được doanh thu toàn công ty |

**Phần dùng lại được gần hết:** React + TypeScript + Vite, Supabase (Postgres + RLS, Auth, Realtime, Storage), TanStack Query, shadcn/ui (quản lý), Konsta UI (nhân viên), luật trạng thái việc, lịch sử trạng thái kèm vị trí, nén ảnh. Phần phải làm lại chủ yếu là **lớp phân quyền** (mục 6 của CLAUDE.md).

## 3. Kiến trúc đề xuất: một database, tách dữ liệu theo công ty

Chọn mô hình **dùng chung database, mỗi dòng dữ liệu gắn mã công ty (`org_id`), RLS lọc theo công ty**. Lý do: một codebase, một lần deploy, chi phí thấp, hợp với Supabase. Mô hình "mỗi khách hàng một database riêng" chỉ cân nhắc cho khách hàng lớn có yêu cầu riêng.

### 3.1. Bảng mới (phác thảo, sẽ thiết kế chi tiết và duyệt riêng)

- `organizations (id, name, slug, plan, status, created_at)`: công ty khách hàng.
- `organization_members (org_id, user_id, role, joined_at)`: thành viên và **vai trò theo từng công ty** (`owner` | `manager` | `staff`). Một người có thể thuộc nhiều công ty.
- `organization_invites (id, org_id, email, role, token, expires_at)`: mời nhân viên qua email/link.

### 3.2. Thay đổi trên bảng hiện có

- Thêm `org_id` vào: `projects`, `tasks`, `conversations`, `notifications`, `last_locations`, `staff_details`… (bảng con như `task_assignees`, `task_comments` suy ra công ty qua bảng cha).
- Bỏ `profiles.role` toàn hệ thống; các hàm `is_manager()`, `manages_user()`, `my_role()` chuyển sang theo công ty đang làm việc.
- Luật "giữ ít nhất 1 quản lý" và "không tự hạ quyền mình" áp dụng **trong từng công ty**.
- Dữ liệu hiện có chuyển sang **công ty đầu tiên** bằng migration.

### 3.3. Phân quyền 3 cấp trong công ty (đã chốt 07/11/2026)

Vai trò lưu ở `organization_members.role`: `owner` (Chủ doanh nghiệp) | `manager` (Quản lý) | `staff` (Nhân viên). Lý do có cấp `owner`: khi có tính năng doanh thu, quản lý không được xem dữ liệu của toàn công ty.

| Dữ liệu / thao tác | Chủ doanh nghiệp | Quản lý | Nhân viên |
|---|---|---|---|
| Thông tin công ty, gói cước, thanh toán | ✅ | ❌ | ❌ |
| Nâng/hạ quyền, khoá tài khoản | ✅ mọi người | ❌ | ❌ |
| Mời người vào công ty | ✅ mọi vai trò | ✅ chỉ mời `staff` | ❌ |
| Tạo dự án | ✅ | ✅ (người tạo tự là quản lý dự án) | ❌ |
| Xoá dự án, chỉ định quản lý dự án | ✅ mọi dự án | Dự án mình phụ trách | ❌ |
| Công việc, bình luận, lịch sử trạng thái | ✅ toàn công ty | Dự án mình phụ trách | Việc được giao |
| Vị trí nhân viên | ✅ toàn công ty | Nhân viên trong dự án mình | Chỉ của mình |
| Danh bạ nhân viên (tên, SĐT, ngày vào làm) | ✅ | ✅ toàn công ty, để thêm người vào dự án | Chỉ của mình |
| **Doanh thu** (tương lai) | ✅ toàn công ty | **Dự án mình phụ trách** | ❌ |
| Nhật ký thao tác nhạy cảm | ✅ | ❌ | ❌ |

Quy tắc:
- **Doanh thu gắn theo dự án** (`project_id`), nên RLS dùng chung cách kiểm tra "quản lý dự án" như công việc.
- **Một công ty có thể có nhiều owner**, quyền ngang nhau. Người tạo công ty tự động là owner. Chỉ owner mới phong người khác làm owner hoặc quản lý.
- Công ty luôn còn **ít nhất 1 owner**; owner không tự hạ quyền mình (trigger, giống `profiles_guard` hiện nay).
- Hạ quyền một quản lý thì các dự án họ đang phụ trách được chuyển cho người thực hiện (giữ luật hiện tại).
- **Không lưu CCCD**: đã bỏ các cột `id_number`, `id_issued_on`, `id_issued_place` khỏi `staff_details` và khỏi trang Nhân viên (migration 0017).

### 3.4. Nguyên tắc bắt buộc

- **Mọi bảng mới phải có RLS lọc theo công ty ngay trong migration tạo bảng** (giữ quy tắc hiện tại của CLAUDE.md).
- **Test tự động cho RLS** (ví dụ pgTAP): với mỗi bảng, chứng minh người của công ty A **không đọc/sửa được** dữ liệu công ty B. Chạy test này trước mỗi lần deploy.
- Đường dẫn file trong Storage có tiền tố công ty: `orgs/{org_id}/tasks/{task_id}/…`.

## 4. Lộ trình theo giai đoạn

### Giai đoạn 1: Đa khách hàng (làm ngay, trước tính năng mới)

| Việc | Tiêu chí hoàn thành |
|---|---|
| Thiết kế và migration bảng tổ chức, chuyển dữ liệu cũ sang công ty đầu tiên | App chạy như cũ cho công ty hiện tại |
| Phân quyền theo công ty (RLS, trigger, hàm SQL) | Test RLS chứng minh hai công ty không thấy dữ liệu của nhau |
| Công ty tự đăng ký; mời nhân viên qua email/link | Một công ty mới tự tạo được và mời được nhân viên mà không cần can thiệp |
| Chọn công ty khi một người thuộc nhiều công ty | Chuyển công ty không lẫn dữ liệu |
| Trang quản trị hệ thống (cho chủ Cahute): danh sách công ty, khoá/mở công ty | Khoá một công ty thì người của công ty đó không truy cập được |

**Lý do làm ngay:** càng nhiều dữ liệu và tính năng (Chat, Thông báo) thì việc thêm `org_id` và viết lại RLS càng tốn công, càng dễ sót.

### Giai đoạn 2: Hạ tầng ổn định (trước khách hàng trả phí đầu tiên)

| Việc | Ghi chú |
|---|---|
| Supabase gói trả phí (Pro) | Không bị tạm dừng; sao lưu hằng ngày; cân nhắc sao lưu theo thời điểm (PITR) |
| Tách 2 project Supabase: **staging** (thử) và **production** (thật) | Nhánh preview trên Vercel trỏ vào staging |
| Bản đồ tự host (đã chốt 07/11/2026): file **PMTiles** khu vực Việt Nam (Protomaps, dữ liệu OpenStreetMap) đặt trên **Cloudflare R2**, hiển thị bằng thư viện Protomaps/MapLibre | Thay OpenStreetMap France. Không cần API key, không tính phí theo lượt tải. Giữ ghi công OpenStreetMap. Cập nhật file bản đồ định kỳ (ví dụ mỗi quý). Không cho khách tự nhập key Google Maps (chỉ cân nhắc cho khách hàng lớn yêu cầu riêng). Nút "Mở trên Google Maps" giữ nguyên (miễn phí, không cần key). Đọc `docs/location.md` trước khi làm |
| Gửi email (mời, đặt lại mật khẩu): Resend hoặc Amazon SES | Dùng tên miền riêng, cấu hình SPF/DKIM |
| Giám sát lỗi: Sentry (frontend + Edge Functions) | Biết lỗi trước khi khách báo |
| CI trên GitHub Actions: build, lint, test (gồm test RLS) | Không deploy khi test hỏng |
| Tên miền riêng cho app | Thay địa chỉ `*.vercel.app` |

### Giai đoạn 3: Thu phí

| Việc | Ghi chú |
|---|---|
| Gói cước theo **số nhân viên** (ví dụ: Miễn phí ≤ 5 người, Cơ bản, Doanh nghiệp) | Giới hạn gói thực thi ở **database** (trigger chặn thêm thành viên vượt gói), không chỉ ở giao diện |
| Thanh toán trong nước: chuyển khoản/VietQR, VNPay, MoMo | Khách nước ngoài: Stripe hoặc Paddle |
| Hoá đơn điện tử | Theo quy định thuế hiện hành |
| Dùng thử, gia hạn, hết hạn → chuyển công ty sang chế độ chỉ đọc | Không xoá dữ liệu ngay khi hết hạn |

### Giai đoạn 4: Mở rộng

| Việc | Ghi chú |
|---|---|
| App điện thoại thật bằng **Capacitor** (giữ code React) | Có trên App Store/CH Play; thông báo đẩy ổn định trên iPhone; tuỳ chọn định vị nền nếu khách cần |
| Chat, Thông báo (Web Push + Telegram) theo đặc tả hiện có | Gắn `org_id` ngay từ đầu (xem `docs/notifications.md`) |
| Báo cáo, xuất Excel | Theo nhu cầu khách hàng |
| Tài liệu hướng dẫn, kênh hỗ trợ khách hàng | |

## 5. Pháp lý và dữ liệu cá nhân

Cahute lưu **vị trí** và thông tin nhân sự của nhân viên khách hàng (số CCCD sẽ bỏ, xem 3.3). Theo hiểu biết hiện tại, việc này chịu sự điều chỉnh của **Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân** và có thể các văn bản mới hơn. Các việc dự kiến cần làm (**phải xác nhận với luật sư**):

- Chính sách quyền riêng tư và điều khoản sử dụng.
- Hợp đồng xử lý dữ liệu giữa Cahute và công ty khách hàng (ai là bên kiểm soát, ai là bên xử lý dữ liệu).
- Cơ chế ghi nhận sự đồng ý của nhân viên khi lấy vị trí; cho nhân viên biết khi nào vị trí được ghi.
- Kiểm tra yêu cầu về **nơi lưu trữ dữ liệu** (trong hay ngoài Việt Nam) đối với loại dịch vụ này; chọn vùng máy chủ Supabase phù hợp.
- Thời hạn lưu trữ: vị trí đã tự xoá sau 30 ngày; cần quy định tương tự cho dữ liệu khác và cho công ty đã ngừng dùng.

## 6. Bảo mật

- Xác thực hai lớp (2FA) cho tài khoản quản lý và chủ công ty.
- Nhật ký thao tác quan trọng (đổi quyền, xoá dự án, xoá nhân viên) theo từng công ty.
- Giới hạn tần suất (rate limit) cho đăng ký, mời, đăng nhập.
- Kiểm thử bảo mật (pentest) trước khi bán rộng.
- Không bao giờ dùng service role ở frontend (giữ quy tắc hiện tại).

## 7. Rủi ro chính

| Rủi ro | Cách giảm |
|---|---|
| Rò dữ liệu giữa các công ty | Test RLS tự động cho mọi bảng; review mọi migration |
| Dịch vụ miễn phí ngừng hoặc đổi chính sách (đã gặp với CARTO, DNS VNPT chặn openstreetmap.org) | Dùng dịch vụ trả phí có cam kết cho phần quan trọng |
| Sửa database trên bản thật làm hỏng dữ liệu khách | Staging riêng; migration chạy thử ở staging trước; sao lưu trước khi deploy |
| Vi phạm quy định dữ liệu cá nhân | Tư vấn luật sư trước khi bán |
| Thông báo đẩy và vị trí trên iPhone hạn chế khi là PWA | Capacitor ở giai đoạn 4 |

## 8. Quyết định cần chốt trước khi làm Giai đoạn 1

1. Một người có được thuộc **nhiều công ty** không (ví dụ thợ làm cho nhiều bên)? Đề xuất: **có**.
2. ~~Vai trò trong công ty~~ → **Đã chốt:** `owner` / `manager` / `staff`, xem 3.3.
3. Công ty mới tự đăng ký hay phải qua bạn duyệt?
4. Mỗi công ty có tên miền con riêng (`congtyA.cahute.vn`) hay dùng chung một địa chỉ?
5. Vùng máy chủ Supabase (phụ thuộc kết quả tư vấn pháp lý về nơi lưu trữ dữ liệu).

## 9. Bước tiếp theo

Chốt các quyết định ở mục 8 → Claude đề xuất **thiết kế database đa khách hàng chi tiết** (bảng, RLS, cách chuyển dữ liệu hiện có) để duyệt → viết migration và test RLS → cập nhật CLAUDE.md mục 6.
