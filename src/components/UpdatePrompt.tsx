import { useRegisterSW } from 'virtual:pwa-register/react'

// Đăng ký service worker và báo khi có phiên bản mới.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex items-center gap-3 rounded-xl bg-gray-900 p-3 text-white shadow-lg">
      <span className="flex-1 text-sm">Có phiên bản mới.</span>
      <button className="min-h-12 rounded-lg px-3 text-sm text-gray-300" onClick={() => setNeedRefresh(false)}>
        Để sau
      </button>
      <button className="min-h-12 rounded-lg bg-green-600 px-4 text-sm font-semibold" onClick={() => updateServiceWorker()}>
        Tải lại
      </button>
    </div>
  )
}
