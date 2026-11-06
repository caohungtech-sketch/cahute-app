import { useEffect, type ReactNode } from 'react'
import { STATUS_LABEL, STATUS_STYLE } from '../lib/taskStatus'
import type { TaskStatus } from '../lib/types'

export const btn = {
  primary:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-semibold text-white active:bg-blue-800 disabled:opacity-50',
  secondary:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 font-medium text-gray-800 ring-1 ring-gray-300 active:bg-gray-100 disabled:opacity-50',
  danger:
    'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 font-medium text-red-700 ring-1 ring-red-300 active:bg-red-50 disabled:opacity-50',
}

export const inputCls =
  'block w-full min-h-12 rounded-xl border border-gray-300 bg-white px-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200'

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Đang tải">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
      ))}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
      <p>{message}</p>
      {onRetry && (
        <button className={`${btn.secondary} mt-3`} onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  )
}

// bottomClass: khoảng cách tới đáy (trang nhân viên có thanh tab iOS cao hơn nên đẩy toast lên cao hơn).
export function Toast({
  message,
  onClose,
  bottomClass = 'bottom-[calc(5rem+env(safe-area-inset-bottom))]',
}: {
  message: string | null
  onClose: () => void
  bottomClass?: string
}) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null
  return (
    <div
      role="alert"
      className={`fixed inset-x-4 ${bottomClass} z-50 rounded-xl bg-gray-900 p-3 text-sm text-white shadow-lg`}
      onClick={onClose}
    >
      {message}
    </div>
  )
}

export function FullScreenMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">{children}</div>
}
