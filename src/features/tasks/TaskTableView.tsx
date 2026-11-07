import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { ErrorBox, Skeleton } from '../../components/ui'
import { displayName } from '../../lib/profiles'
import { useProjectMembers } from '../../lib/projects'
import { STATUS_LABEL, STATUSES } from '../../lib/taskStatus'
import type { Profile, Task, TaskStatus } from '../../lib/types'
import TaskCard from './TaskCard'
import TaskDataTable from './TaskDataTable'
import { DEFAULT_SORT, useTaskPage, type DueFilter, type StatusFilter, type TaskSort } from './useTaskPage'
import { useIsMobile } from '../../lib/useIsMobile'
import QuickSearch from './QuickSearch'

const PAGE_SIZES = [10, 20, 50]

const DUE_OPTIONS: { kind: DueFilter['kind']; label: string }[] = [
  { kind: 'all', label: 'Mọi hạn' },
  { kind: 'overdue', label: 'Quá hạn' },
  { kind: 'today', label: 'Hôm nay' },
  { kind: 'next7', label: '7 ngày tới' },
  { kind: 'none', label: 'Không có hạn' },
  { kind: 'range', label: 'Tuỳ chọn khoảng ngày…' },
]
const filterCls = 'min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm'

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
  // Máy tính: sắp xếp + lọc người làm/hạn. Điện thoại giữ như cũ (không áp dụng các lựa chọn này).
  const [sort, setSort] = useState<TaskSort>(DEFAULT_SORT)
  const [assigneeId, setAssigneeId] = useState<string | null>(null)
  const [due, setDue] = useState<DueFilter>({ kind: 'all' })
  const { managedProjects } = useAuth()
  const { members } = useProjectMembers(isMobile ? [] : projectId ? [projectId] : managedProjects.map((p) => p.id))
  const people = [...new Set(Object.values(members).flat())]
    .map((id) => profilesById.get(id))
    .filter((p): p is Profile => !!p && !p.deleted_at)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'vi'))
  // Người đã chọn không còn trong dự án đang xem → bỏ lọc người làm
  const assignee = assigneeId && people.some((p) => p.id === assigneeId) ? assigneeId : null

  const { rows, counts, total, loading, error, reload, updateStatus } = useTaskPage(
    projectId,
    status,
    page,
    pageSize,
    isMobile ? undefined : { sort, assigneeId: assignee, due },
  )

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const showPager = isMobile ? total > pageSize : total > 0
  const filterKey = JSON.stringify([sort, assignee, due])
  const hasFilter = assignee !== null || due.kind !== 'all'

  const canManage = useCallback((t: Task) => managedProjects.some((m) => m.id === t.project_id), [managedProjects])

  // Đổi bộ lọc → về trang 1; số trang giảm (việc bị xoá…) → lùi về trang cuối.
  useEffect(() => setPage(0), [projectId, status, pageSize, filterKey])
  // Chuyển từ màn hình lớn sang điện thoại khi đang ở "Tất cả" → về "Chưa làm" (điện thoại không có tab này).
  useEffect(() => {
    if (isMobile && status === 'all') setStatus('todo')
  }, [isMobile, status])
  useEffect(() => {
    if (!loading && page > pages - 1) setPage(pages - 1)
  }, [loading, page, pages])

  const change = useCallback(
    async (task: Task, next: TaskStatus) => {
      const err = await updateStatus(task, next)
      if (err) onError(err)
    },
    [updateStatus, onError],
  )

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
                  status === s ? 'bg-white text-indigo-800 shadow-sm ring-1 ring-indigo-200' : 'text-gray-600'
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
        <>
          <div className="mb-3 flex gap-2 overflow-x-auto py-0.5">
            {DESKTOP_TABS.map((s) => (
              <button
                key={s}
                className={`min-h-10 shrink-0 rounded-full px-3 text-sm ${
                  status === s ? 'bg-indigo-700 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-300'
                }`}
                onClick={() => setStatus(s)}
              >
                {s === 'all' ? 'Tất cả' : STATUS_LABEL[s]} ({counts[s]})
              </button>
            ))}
          </div>

          {/* Lọc theo người làm và hạn (làm ở server, số đếm ở tab cũng theo bộ lọc) */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select
              className={filterCls}
              value={assignee ?? ''}
              onChange={(e) => setAssigneeId(e.target.value || null)}
              aria-label="Lọc theo người làm"
            >
              <option value="">Mọi người làm</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                </option>
              ))}
            </select>
            <select
              className={filterCls}
              value={due.kind}
              onChange={(e) => {
                const kind = e.target.value as DueFilter['kind']
                setDue(kind === 'range' ? { kind, from: '', to: '' } : { kind })
              }}
              aria-label="Lọc theo hạn"
            >
              {DUE_OPTIONS.map((o) => (
                <option key={o.kind} value={o.kind}>
                  {o.label}
                </option>
              ))}
            </select>
            {due.kind === 'range' && (
              <>
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                  Từ
                  <input
                    type="date"
                    className={filterCls}
                    value={due.from}
                    max={due.to || undefined}
                    onChange={(e) => setDue({ ...due, from: e.target.value })}
                  />
                </label>
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                  đến
                  <input
                    type="date"
                    className={filterCls}
                    value={due.to}
                    min={due.from || undefined}
                    onChange={(e) => setDue({ ...due, to: e.target.value })}
                  />
                </label>
              </>
            )}
            {hasFilter && (
              <button
                className="min-h-10 rounded-lg px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
                onClick={() => {
                  setAssigneeId(null)
                  setDue({ kind: 'all' })
                }}
              >
                Xoá lọc
              </button>
            )}
          </div>
        </>
      )}

      {error && <ErrorBox message={error} onRetry={reload} />}

      {loading ? (
        <Skeleton />
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-gray-500">
          {hasFilter && !isMobile ? 'Không có công việc nào khớp bộ lọc.' : 'Không có công việc nào.'}
        </p>
      ) : isMobile ? (
        <>
          {/* Điện thoại: mỗi dòng là một thẻ */}
          <div className="space-y-2">
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
        </>
      ) : (
        // Máy tính: bảng. Đổi trang/bộ lọc → key đổi → bỏ chọn các dòng.
        <TaskDataTable
          key={JSON.stringify([projectId, status, page, pageSize, filterKey])}
          rows={rows}
          sort={sort}
          onSortChange={setSort}
          profilesById={profilesById}
          canChange={canChange}
          canManage={canManage}
          onChangeStatus={change}
          onMessage={onError}
        />
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
