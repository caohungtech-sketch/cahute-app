# Vị trí nhân viên – ghi khi đổi trạng thái việc

> Đặc tả chi tiết, tách ra từ CLAUDE.md (mục 9). Đọc file này trước khi sửa phần vị trí / bản đồ.
> Thay cho cách cũ dùng Traccar Client (đã bỏ ở migration 0015).

## Cách hoạt động

- **Không theo dõi liên tục.** Vị trí chỉ được lấy **một lần** khi nhân viên bấm đổi trạng thái việc (Bắt đầu làm / Tạm dừng / Tiếp tục / Hoàn thành) trên các trang `src/staff/`. Quản lý đổi trạng thái thì không lấy vị trí.
- Frontend: `getCurrentPosition()` trong `src/lib/geolocation.ts` (chờ tối đa ~8 s, chấp nhận vị trí cũ ≤ 60 s). Bị từ chối quyền / không bắt được GPS / quá thời gian → `null`, **trạng thái vẫn được đổi** (không bao giờ chặn việc đổi trạng thái vì vị trí).
- Gửi qua RPC `set_task_status(p_task_id, p_status, p_lat, p_lon, p_accuracy)` (`features/tasks/api.ts` → `setTaskStatus(..., { withLocation: true })`). RPC là `security invoker`: RLS và trigger `tasks_before_update` vẫn kiểm tra quyền và luật chuyển trạng thái như khi update trực tiếp. Trả về `false` nếu không có quyền.
- Giao diện đổi trạng thái ngay (optimistic); việc lấy vị trí + gửi lên chạy sau.

## Database (migration 0015)

- `task_status_events (id, task_id, user_id, from_status, to_status, created_at, lat, lon, accuracy)`: lịch sử **mọi** lần đổi trạng thái, do trigger `tasks_after_status_change` tự ghi (kể cả quản lý đổi, kể cả không qua RPC). Vị trí do RPC truyền cho trigger qua biến cục bộ của giao dịch `cahute.status_location`.
- Có vị trí → upsert `last_locations (user_id, recorded_at, lat, lon, accuracy)` để vẽ bản đồ.
- RLS: xem lịch sử khi xem được việc (quản lý dự án hoặc nhân viên được giao). Không ai insert/sửa/xoá trực tiếp. `last_locations`: chỉ chính người đó hoặc `manages_user(user_id)`.
- **Lưu trữ:** `pg_cron` 02:00 giờ VN mỗi đêm xoá toạ độ (`lat/lon/accuracy` → null) của sự kiện cũ hơn **30 ngày** (giữ dòng lịch sử) và xoá `last_locations` cũ hơn 30 ngày.
- Lưu ý: toạ độ do trình duyệt cung cấp, người dùng có kỹ thuật có thể giả lập; dùng để tham khảo, không phải bằng chứng tuyệt đối.

## Hiển thị (chỉ quản lý)

- **Bản đồ trang Tổng quan** (`features/map/StaffMap.tsx`): **Leaflet + OpenStreetMap**, không cần API key; tải riêng khi mở trang. Chấm xanh = có vị trí trong 2 giờ qua, xám = cũ hơn. Bọc `isolate` để các lớp z-index của Leaflet không đè thanh trên.
- Ô bản đồ `tile.openstreetmap.org`: phải giữ dòng ghi nguồn "© OpenStreetMap"; chỉ hợp lượng truy cập nhỏ. Nếu nhiều người dùng, chuyển sang nhà cung cấp ô bản đồ khác (đổi `TILE_URL`).
- **Lịch sử trạng thái** trong trang chi tiết việc của quản lý (`features/tasks/StatusHistory.tsx`): thời gian, người đổi, từ → sang, link "Xem vị trí" mở openstreetmap.org.
