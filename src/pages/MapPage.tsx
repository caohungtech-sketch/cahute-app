import { lazy, Suspense } from 'react'
import { X } from 'lucide-react'
import { ErrorBox } from '../components/ui'
import { useStaffPoints } from '../features/map/useStaffPoints'

const StaffMap = lazy(() => import('../features/map/StaffMap'))

// Bản đồ vị trí nhân viên chiếm trọn cửa sổ (mở từ nút phóng to ở trang Tổng quan, cửa sổ riêng).
// Không có sidebar/thanh trên của quản lý. Vị trí cập nhật theo Realtime như trang Tổng quan.
export default function MapPage() {
  const { points, error, reload } = useStaffPoints('map-page-last-locations')
  const recent = points.filter((p) => p.recent).length
  // window.close() chỉ đóng được cửa sổ do app mở ra
  const canClose = typeof window !== 'undefined' && !!window.opener

  return (
    <div className="flex h-dvh flex-col bg-white">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-indigo-950 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] text-white">
        <h1 className="flex-1 truncate font-semibold">
          Cahute <span className="font-normal text-indigo-300">· Vị trí nhân viên</span>
        </h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden />
          {recent}/{points.length} có vị trí trong 2 giờ qua
        </span>
        {canClose && (
          <button
            className="grid h-11 w-11 place-items-center rounded-lg text-indigo-200 hover:bg-white/10 hover:text-white"
            onClick={() => window.close()}
            aria-label="Đóng cửa sổ bản đồ"
            title="Đóng cửa sổ"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
        )}
      </header>

      {error && (
        <div className="p-3">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      )}

      <main className="min-h-0 flex-1 bg-gray-100 pb-[env(safe-area-inset-bottom)]">
        <Suspense fallback={<div className="h-full animate-pulse bg-gray-100" />}>
          <StaffMap points={points} />
        </Suspense>
      </main>
    </div>
  )
}
