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

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [message, onClose])

  if (!message) return null
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 rounded-xl bg-gray-900 p-3 text-sm text-white shadow-lg"
      onClick={onClose}
    >
      {message}
    </div>
  )
}

export function FullScreenMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-4 text-center">{children}</div>
}

// ---------------------------------------------------------------------
// Bảng dữ liệu – theo "Quy chuẩn Bảng Dữ Liệu" trong CLAUDE.md
// ---------------------------------------------------------------------
export const tableCls = {
  wrap: 'overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-200',
  head: 'border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600',
  body: 'divide-y divide-gray-200',
  row: 'group hover:bg-gray-50',
  // Thao tác ẩn, hiện khi rê chuột vào dòng; máy cảm ứng (không rê chuột được) luôn hiện
  actions: 'transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 focus-within:opacity-100',
}

const AVATAR_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-teal-500',
  'bg-orange-500',
]

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  // Tên Việt: chữ cái đầu của tên (từ cuối), thêm họ nếu có
  const last = words[words.length - 1][0]
  return (words.length > 1 ? words[0][0] + last : last).toUpperCase()
}

function colorFor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

// Ảnh đại diện chồng lớp (chữ cái đầu). Hiện tối đa `max` người, còn lại "+n".
export function AvatarStack({ people, max = 4 }: { people: { id: string; name: string }[]; max?: number }) {
  if (!people.length) return <span className="text-gray-400">—</span>
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <div className="flex items-center -space-x-2" title={people.map((p) => p.name).join(', ')}>
      {shown.map((p) => (
        <span
          key={p.id}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ring-2 ring-white ${colorFor(p.id)}`}
          aria-label={p.name}
        >
          {initials(p.name)}
        </span>
      ))}
      {rest > 0 && (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gray-200 text-xs font-semibold text-gray-700 ring-2 ring-white">
          +{rest}
        </span>
      )}
    </div>
  )
}

// Phân trang: trái = tổng số bản ghi + số dòng/trang, phải = Trước/Sau
export function Pagination({
  page,
  pageSize,
  total,
  unit,
  sizes,
  onPage,
  onPageSize,
}: {
  page: number
  pageSize: number
  total: number
  unit: string
  sizes?: number[]
  onPage: (page: number) => void
  onPageSize?: (size: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const pagerBtn = 'min-h-10 rounded-lg bg-white px-3 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40 md:px-4'
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Phân trang">
      <div className="flex items-center gap-2 text-gray-600">
        <span>
          {total ? page * pageSize + 1 : 0}–{Math.min(total, (page + 1) * pageSize)} / {total} {unit}
        </span>
        {sizes && onPageSize && (
          <select
            className="min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-base md:text-sm"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            aria-label="Số dòng mỗi trang"
          >
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n} / trang
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        <button className={pagerBtn} disabled={page === 0} onClick={() => onPage(page - 1)}>
          ‹ Trước
        </button>
        <span className="min-w-12 text-center tabular-nums md:min-w-16">
          {page + 1} / {pages}
        </span>
        <button className={pagerBtn} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Sau ›
        </button>
      </div>
    </nav>
  )
}
