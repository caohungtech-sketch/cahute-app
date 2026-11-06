import { QueryClient } from '@tanstack/react-query'

// Mặc định: hiện ngay dữ liệu đã có trong bộ nhớ đệm rồi tải lại ngầm khi mở trang / quay lại app.
// Thử lại 1 lần khi lỗi (lỗi quyền RLS thì báo ngay, không chờ thử lại nhiều lần).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
})
