# Tài khoản – quản lý tạo nhân viên, đổi mật khẩu lần đầu, đặt lại mật khẩu

> Đặc tả, liên quan CLAUDE.md mục 4 (bí mật) và mục 5 (vai trò). Đọc file này trước khi sửa phần đăng nhập / tài khoản.
> Trạng thái: đã chốt 08/11/2026 (mục 9).

## 1. Mục tiêu

- Không ai tự đăng ký được. **Chỉ quản lý tạo tài khoản** cho người khác (email + mật khẩu tạm).
- Lần đầu đăng nhập bằng mật khẩu tạm, người dùng **bắt buộc đổi mật khẩu** rồi mới dùng app.
- Quên mật khẩu → **nhờ quản lý đặt lại** (lại ra mật khẩu tạm, lại bắt đổi). **Không cần SMTP**, app không gửi email nào.

Ngoài phạm vi: đăng nhập Google, magic link/OTP, gửi email mời. Lộ trình SaaS (`organization_invites`, xem `saas-roadmap.md`) làm sau.

## 2. Luồng

### 2.1 Tạo nhân viên (trang `/staff`)

1. Quản lý bấm **"+ Thêm nhân viên"** → hộp thoại (`ResponsiveDialog`): Họ tên*, Email*, SĐT, Ngày vào làm, Dự án (chỉ các dự án mình quản lý, chọn nhiều, có thể bỏ trống).
2. App gọi Edge Function `admin-users` (`action: 'create'`). Mật khẩu tạm do **server sinh ngẫu nhiên** (8 ký tự, bỏ các ký tự dễ nhầm `0 O 1 l I`).
3. Hộp thoại hiện kết quả **một lần duy nhất**:
   ```
   Đã tạo tài khoản cho Nguyễn Văn A
   Email:     a@gmail.com
   Mật khẩu:  k7Mp-x4Qz
   [Sao chép]   → "Đăng nhập Cahute tại https://…  Email: …  Mật khẩu tạm: …"
   ```
   Quản lý gửi qua Zalo/nói trực tiếp. Đóng hộp thoại là không xem lại được (quên thì đặt lại).
4. Người mới là `staff`. Muốn làm quản lý thì dùng nút "Nâng lên quản lý" sẵn có.

### 2.2 Đăng nhập lần đầu / sau khi được đặt lại

1. Đăng nhập bằng email + mật khẩu tạm như bình thường.
2. `App.tsx`: nếu `session.user.app_metadata.must_change_password === true` → chỉ hiện trang **Đổi mật khẩu** (toàn màn hình, không có menu; có nút Đăng xuất).
3. Nhập mật khẩu mới 2 lần (≥ 8 ký tự) → gọi `admin-users` (`action: 'change_own_password'`) → `supabase.auth.refreshSession()` để JWT mới không còn cờ → vào app.

### 2.3 Quên mật khẩu

- Trang đăng nhập: dòng chữ *"Quên mật khẩu? Liên hệ quản lý để được đặt lại."* (không có nút gửi email).
- Quản lý: trang `/staff` → nút **"Đặt lại mật khẩu"** trên dòng nhân viên → xác nhận → `admin-users` (`action: 'reset_password'`) → hiện mật khẩu tạm mới như 2.1 bước 3. Cờ `must_change_password` bật lại và nhân viên **bị đăng xuất khỏi mọi thiết bị** (trường hợp mất điện thoại).
- **Chỉ đặt lại được cho `staff`**, không đặt lại được cho quản lý khác (tránh quản lý này chiếm tài khoản quản lý kia). Quản lý quên mật khẩu → chủ hệ thống đặt lại trong Supabase Dashboard (Authentication → Users), hoặc hạ quyền xuống nhân viên rồi đặt lại.

### 2.4 Xoá nhân viên = khoá đăng nhập

Nút Xoá ở trang `/staff` gọi `admin-users` (`action: 'deactivate'`): đặt `profiles.deleted_at` (ẩn khỏi danh sách như cũ, dữ liệu vẫn giữ), **khoá đăng nhập** (`ban_duration`) và đăng xuất khỏi mọi thiết bị. Đăng nhập lại sẽ báo *"Tài khoản đã bị khoá. Liên hệ quản lý."* Chưa có chức năng khôi phục (mở khoá trong Supabase Dashboard nếu cần).

### 2.5 Đổi mật khẩu chủ động

Trang Tài khoản (quản lý: `AccountPage`, nhân viên: `StaffAccountPage`) có mục **"Đổi mật khẩu"**, dùng chung action `change_own_password`.

## 3. Lưu cờ "phải đổi mật khẩu" ở đâu

`auth.users.raw_app_meta_data.must_change_password` (đọc ở client qua `session.user.app_metadata`).

- `app_metadata` chỉ service role sửa được → người dùng không tự tắt cờ bằng API thường.
- Không cần thêm cột/bảng. Không đặt trong `profiles` (ai đăng nhập cũng đọc được, và người dùng tự sửa được hồ sơ mình).
- Đây là lớp **nhắc buộc ở giao diện**: người dùng cố ý gọi `supabase.auth.updateUser` vẫn đổi được mật khẩu mà cờ còn nguyên (chỉ bị hỏi đổi lần nữa) – không mở thêm quyền dữ liệu nào, chấp nhận được.

## 4. Edge Function `admin-users`

`supabase/functions/admin-users/index.ts`, deploy **có** kiểm tra JWT (mặc định). Dùng service role bên trong; frontend chỉ gửi JWT của người dùng.

| action | Ai gọi được | Làm gì |
|---|---|---|
| `create` `{ full_name, email, phone?, hired_on?, project_ids[] }` | quản lý | `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name }, app_metadata: { must_change_password: true } })` → trigger `handle_new_user` tạo `profiles` (`staff`) → upsert `staff_details` → insert `project_members` (mọi `project_id` phải nằm trong `project_managers` của người gọi, nếu không → lỗi, không tạo gì). Trả `{ user_id, password }` |
| `reset_password` `{ user_id }` | quản lý; người đích phải là `staff` | `auth.admin.updateUserById(user_id, { password, app_metadata: { must_change_password: true } })`. Trả `{ password }` |
| `deactivate` `{ user_id }` | quản lý; không phải chính mình | `profiles.deleted_at = now()`, `updateUserById(user_id, { ban_duration: '876000h' })`, đăng xuất mọi thiết bị |
| `change_own_password` `{ password }` | mọi người đã đăng nhập | `updateUserById(caller, { password, app_metadata: { must_change_password: false } })` |

Đăng xuất mọi thiết bị: admin API không có lệnh theo `user_id`, nên dùng hàm SQL `admin_revoke_sessions(user_id)` (xoá `auth.sessions`, refresh token bị xoá theo) – **chỉ service role gọi được**. Access token đang có vẫn dùng được tới khi hết hạn (mặc định ≤ 1 giờ); sau đó không làm mới được nữa.

Quy tắc chung:
- Xác định người gọi bằng `auth.getUser(jwt)`; kiểm tra quản lý bằng `profiles.role = 'manager' and deleted_at is null`.
- `create` lỗi giữa chừng (sau khi đã tạo user) → xoá user vừa tạo (`auth.admin.deleteUser`) để không để lại tài khoản dở dang.
- Thông báo lỗi trả về bằng tiếng Việt: *"Email này đã có tài khoản"*, *"Bạn không quản lý dự án …"*, *"Chỉ đặt lại được mật khẩu của nhân viên"*, *"Mật khẩu phải có ít nhất 8 ký tự"*.
- Không log mật khẩu.

## 5. Database (migration mới)

- Hàm `staff_emails()` (`security definer`, `stable`): trả `(user_id, email)` từ `auth.users`; **chỉ trả dữ liệu khi `is_manager()`**, người khác nhận rỗng. Trang `/staff` dùng để hiện cột **Email** (quản lý cần biết email đăng nhập của nhân viên).
- Hàm `admin_revoke_sessions(p_user_id)` (`security definer`): xoá phiên đăng nhập; thu hồi quyền `execute` của `public/anon/authenticated`, chỉ cấp cho `service_role`.
- Không thêm bảng, không đổi RLS, không đổi `handle_new_user` (người tạo qua Edge Function luôn là `staff` vì đã có hồ sơ khác; tài khoản quản lý đầu tiên đã tồn tại).

## 6. Giao diện

- `LoginPage`: bỏ tab Đăng ký và ô Họ tên; thêm dòng "Quên mật khẩu? Liên hệ quản lý…".
- `ChangePasswordPage` (mới, `src/pages/`): dùng chung cho mọi vai trò, Tailwind thường như `LoginPage` (không Konsta, vì hiện trước khi vào layout).
- `StaffPage`: nút **"+ Thêm nhân viên"** (xanh lá) ở đầu trang, cột **Email**, nút **"Đặt lại mật khẩu"** (biểu tượng chìa khoá) chỉ hiện trên dòng `staff`, hộp thoại hiện mật khẩu tạm + Sao chép. Nút Xoá chuyển sang gọi `deactivate`.
- `LoginPage`: lỗi tài khoản bị khoá → *"Tài khoản đã bị khoá. Liên hệ quản lý."*
- `AccountPage`, `StaffAccountPage`: mục Đổi mật khẩu.

## 7. Cấu hình Supabase (làm tay, một lần)

- Authentication → Sign In / Providers → **tắt "Allow new users to sign up"**. (`auth.admin.createUser` vẫn hoạt động khi tắt.)
- Email provider: có thể tắt "Confirm email" (đã dùng `email_confirm: true` nên không bắt buộc).
- Deploy: `npx supabase functions deploy admin-users`. Không cần secret mới (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` có sẵn).

## 8. Kế hoạch làm & kiểm tra

| Bước | Kiểm tra |
|---|---|
| 1. Migration `staff_emails()`, `admin_revoke_sessions()` | Quản lý gọi `staff_emails` ra email, nhân viên ra rỗng; `authenticated` gọi `admin_revoke_sessions` bị từ chối |
| 2. Edge Function `admin-users` | Tạo user có dự án; xoá → đăng nhập báo bị khoá; nhân viên gọi `create`/`reset_password` bị 403; tạo trùng email báo lỗi; dự án không thuộc mình báo lỗi và không còn user dở dang |
| 3. `App.tsx` + `ChangePasswordPage` | Đăng nhập mật khẩu tạm → chỉ thấy trang đổi mật khẩu; đổi xong vào thẳng app; tải lại trang không hỏi lại |
| 4. `StaffPage`: thêm, email, đặt lại | Tạo → sao chép → đăng nhập được trên điện thoại; đặt lại → mật khẩu cũ hết hiệu lực, bị bắt đổi lại |
| 5. `LoginPage`, trang Tài khoản | Không còn tab Đăng ký; đổi mật khẩu chủ động được |
| 6. Tắt sign up trên Supabase | `supabase.auth.signUp` từ console trình duyệt bị từ chối |
| Cuối | `npm run build`, `npm run lint` không lỗi; cập nhật CLAUDE.md (mục 4/5 + trỏ tới file này) |

## 9. Quyết định đã chốt (08/11/2026)

1. Chỉ đăng nhập bằng **email** (không SĐT, không OTP).
2. Mật khẩu tạm **sinh ngẫu nhiên** cho từng người.
3. **Xoá nhân viên = khoá đăng nhập** (mục 2.4).
4. Đặt lại mật khẩu **đăng xuất khỏi mọi thiết bị**.
