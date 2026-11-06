# Định vị bằng Traccar → Supabase

> Đặc tả chi tiết, tách ra từ CLAUDE.md (mục 9). Đọc file này trước khi làm tính năng định vị / bản đồ.

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
