-- =====================================================================
-- Cahute – Phần 17: không lưu CCCD nữa
--   Bỏ số CCCD, ngày cấp, nơi cấp khỏi staff_details (giảm dữ liệu cá nhân
--   nhạy cảm, xem docs/saas-roadmap.md mục 3.3). Dữ liệu bị xoá vĩnh viễn.
--   Không hàm/trigger/policy nào dùng các cột này.
-- =====================================================================

alter table public.staff_details
  drop column id_number,
  drop column id_issued_on,
  drop column id_issued_place;
