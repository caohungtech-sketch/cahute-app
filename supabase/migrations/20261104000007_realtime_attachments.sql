-- Ảnh được gắn vào bình luận ngay sau khi bình luận được tạo; cần Realtime
-- để người khác thấy ảnh mà không phải tải lại trang.
alter publication supabase_realtime add table public.task_attachments;
