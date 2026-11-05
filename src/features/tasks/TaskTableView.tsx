import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ErrorBox, Skeleton, StatusBadge } from '../../components/ui'
import { displayName } from '../../lib/profiles'
import { actionLabel, STAFF_TRANSITIONS, STATUS_LABEL, STATUSES } from '../../lib/taskStatus'
import { formatDateTime } from '../../lib/time'
import type { Profile, Task, TaskStatus } from '../../lib/types'
import TaskCard from './TaskCard'
import { useTaskPage, type StatusFilter } from './useTaskPage'
import { useIsMobile } from '../../lib/useIsMobile'
import QuickSearch from './QuickSearch'

const PAGE_SIZES = [10, 20, 50]

// Điện thoại: 4 tab trạng thái (mặc định "Chưa làm"), không có "Tất cả"; mỗi tab 20 việc/trang,
// chỉ hiện nút chuyển trang khi vượt quá 20.
const DESKTOP_TABS: StatusFilter[] = ['all', ...STATUSES]
const MOBILE_PAGE_SIZE = 20

interface Props {
  projectId: string | null
  profilesById: Map<string, Profile>
  canChange: (t: Task) => boolean
  onError: (message: string) => void
}

export default function TaskTableView({ projectId, profilesById, canChange, onError }: Props) {
  const isMobile = useIsMobile()
  const [status, setStatus] = useState<StatusFilter>(isMobile ? 'todo' : 'all')
  const [page, setPage] = useState(0)
  const [desktopPageSize, setPageSize] = useState(20)
  const pageSize = isMobile ? MOBILE_PAGE_SIZE : desktopPageSize
  const { rows, counts, total, loading, error, reload, updateStatus } = useTaskPage(projectId, status, page, pageSize)

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const showPager = isMobile ? total > pageSize : total > 0

  // Đổi bộ lọc → về trang 1; số trang giảm (việc bị xoá…) → lùi về trang cuối.
  useEffect(() => setPage(0), [projectId, status, pageSize])
  // Chuyển từ màn hình lớn sang điện thoại khi đang ở "Tất cả" → về "Chưa làm" (điện thoại không có tab này).
  useEffect(() => {
    if (isMobile && status === 'all') setStatus('todo')
  }, [isMobile, status])
  useEffect(() => {
    if (!loading && page > pages - 1) setPage(pages - 1)
  }, [loading, page, pages])

  async function change(task: Task, next: TaskStatus) {
    const err = await updateStatus(task, next)
    if (err) onError(err)
  }

  const names = (t: Task) =>
    t.task_assignees.length ? t.task_assignees.map((a) => displayName(profilesById.get(a.user_id))).join(', ') : '—'

  return (
    <div>
      {isMobile ? (
        <>
          <QuickSearch projectId={projectId} />
          {/* 4 tab chia đều một hàng, không cuộn ngang (tránh bị cắt viền) */}
          <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-gray-200 p-1" role="tablist">
            {STATUSES.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={status === s}
                className={`flex min-h-10 flex-col items-center justify-center rounded-lg px-0.5 leading-tight ${
                  status === s ? 'bg-white text-blue-800 shadow-sm ring-1 ring-blue-200' : 'text-gray-600'
                }`}
                onClick={() => setStatus(s)}
              >
                <span className="whitespace-nowrap text-xs font-medium">{STATUS_LABEL[s]}</span>
                <span className={`text-[11px] ${status === s ? 'font-semibold' : ''}`}>{counts[s]}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mb-3 flex gap-2 overflow-x-auto py-0.5">
          {DESKTOP_TABS.map((s) => (
            <button
              key={s}
              className={`min-h-10 shrink-0 rounded-full px-3 text-sm ${
                status === s ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-300'
              }`}
              onClick={() => setStatus(s)}
            >
              {s === 'all' ? 'Tất cả' : STATUS_LABEL[s]} ({counts[s]})
            </button>
          ))}
        </div>
      )}

      {error && <ErrorBox message={error} onRetry={reload} />}

      {loading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-gray-500">Không có công việc nào.</p>
      ) : (
        <>
          {/* Điện thoại: mỗi dòng là một thẻ */}
          <div className="space-y-2 md:hidden">
            {rows.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                profilesById={profilesById}
                canChangeStatus={canChange(t)}
                showStatus={status === 'all'} // tab trạng thái đã cho biết trạng thái
                onChangeStatus={change}
              />
            ))}
          </div>

          {/* Màn hình lớn: bảng */}
          <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-3 font-medium">Công việc</th>
                  <th className="px-3 py-3 font-medium">Trạng thái</th>
                  <th className="px-3 py-3 font-medium">Người làm</th>
                  <th className="px-3 py-3 font-medium">Kết quả</th>
                  <th className="px-3 py-3 font-medium">Hạn</th>
                  <th className="px-3 py-3 font-medium">Cập nhật</th>
                  <th className="px-3 py-3 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((t) => {
                  const overdue = t.due_at && t.status !== 'done' && new Date(t.due_at) < new Date()
                  const actions = canChange(t) ? STAFF_TRANSITIONS[t.status] : []
                  return (
                    <tr key={t.id} className="align-middle hover:bg-gray-50">
                      <td className="max-w-xs px-3 py-2">
                        <Link to={`/tasks/${t.id}`} className="line-clamp-2 font-medium text-blue-800 hover:underline">
                          {t.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="max-w-48 px-3 py-2 text-gray-700">
                        <span className="line-clamp-2">{names(t)}</span>
                      </td>
                      <td className="max-w-56 px-3 py-2 text-gray-700">
                        <span className="line-clamp-2" title={t.result}>
                          {t.result || '—'}
                        </span>
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 ${overdue ? 'font-semibold text-red-700' : 'text-gray-700'}`}>
                        {t.due_at ? formatDateTime(t.due_at) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-500">{formatDateTime(t.updated_at)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {actions.map((s) => (
                            <button
                              key={s}
                              className={`min-h-10 whitespace-nowrap rounded-lg px-2 text-xs font-medium ${
                                s === 'done' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                              onClick={() => change(t, s)}
                            >
                              {actionLabel(t.status, s)}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Phân trang */}
      {showPager && (
        <nav className="mt-3 flex items-center justify-between gap-2 text-sm md:mt-4 md:flex-wrap" aria-label="Phân trang">
          <div className="flex items-center gap-2 text-gray-600">
            <span className="text-xs md:text-sm">
              {page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} / {total} việc
            </span>
            {!isMobile && (
              <select
                className="min-h-10 rounded-lg border border-gray-300 bg-white px-2"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Số dòng mỗi trang"
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n} / trang
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <button
              className="min-h-10 rounded-lg bg-white px-3 ring-1 ring-gray-300 disabled:opacity-40 md:min-h-12 md:px-4"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ‹ Trước
            </button>
            <span className="min-w-12 text-center md:min-w-16">
              {page + 1} / {pages}
            </span>
            <button
              className="min-h-10 rounded-lg bg-white px-3 ring-1 ring-gray-300 disabled:opacity-40 md:min-h-12 md:px-4"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau ›
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
