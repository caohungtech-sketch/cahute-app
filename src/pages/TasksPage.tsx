import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { btn, ErrorBox, Skeleton, Toast } from '../components/ui'
import TaskCard from '../features/tasks/TaskCard'
import { useTasks } from '../features/tasks/useTasks'
import { useProfiles } from '../lib/profiles'
import { STATUS_LABEL, STATUSES } from '../lib/taskStatus'
import type { Task, TaskStatus } from '../lib/types'

type View = 'list' | 'kanban'

function readView(): View {
  try {
    return localStorage.getItem('tasks.view') === 'kanban' ? 'kanban' : 'list'
  } catch {
    return 'list'
  }
}

export default function TasksPage() {
  const { session, profile, managedTeams } = useAuth()
  const [view, setView] = useState<View>(readView)
  const [teamId, setTeamId] = useState('')
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const { tasks, loading, error, hasMore, reload, loadMore, updateStatus } = useTasks(teamId || null)
  const { byId } = useProfiles()

  const isManager = profile?.role === 'manager'
  const uid = session?.user.id

  const canChange = (t: Task) =>
    managedTeams.some((m) => m.id === t.team_id) || t.task_assignees.some((a) => a.user_id === uid)

  const onChangeStatus = useCallback(
    async (task: Task, next: TaskStatus) => {
      const err = await updateStatus(task, next)
      if (err) setToast(err)
    },
    [updateStatus],
  )

  function changeView(v: View) {
    setView(v)
    try {
      localStorage.setItem('tasks.view', v)
    } catch {
      /* bỏ qua */
    }
  }

  const card = (t: Task, showStatus: boolean) => (
    <TaskCard
      key={t.id}
      task={t}
      profilesById={byId}
      canChangeStatus={canChange(t)}
      showStatus={showStatus}
      onChangeStatus={onChangeStatus}
    />
  )

  const visible = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter)

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h1 className="flex-1 text-xl font-bold">{isManager ? 'Công việc' : 'Việc của tôi'}</h1>
        {isManager && managedTeams.length > 0 && (
          <Link to="/tasks/new" className={btn.primary}>
            + Tạo việc
          </Link>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-2 rounded-xl bg-gray-200 p-1">
          {(['list', 'kanban'] as const).map((v) => (
            <button
              key={v}
              className={`min-h-10 rounded-lg px-3 text-sm font-medium ${view === v ? 'bg-white shadow-sm' : 'text-gray-600'}`}
              onClick={() => changeView(v)}
            >
              {v === 'list' ? 'Danh sách' : 'Kanban'}
            </button>
          ))}
        </div>
        {managedTeams.length > 1 && (
          <select
            className="min-h-12 rounded-xl border border-gray-300 bg-white px-3 text-sm"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            aria-label="Lọc theo nhóm"
          >
            <option value="">Tất cả nhóm</option>
            {managedTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {isManager && managedTeams.length === 0 && (
        <div className="mb-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-900 ring-1 ring-blue-200">
          Bạn chưa quản lý nhóm nào. Vào{' '}
          <Link to="/team" className="font-semibold underline">
            Nhóm
          </Link>{' '}
          để tạo nhóm và thêm nhân viên trước khi giao việc.
        </div>
      )}

      {error && <ErrorBox message={error} onRetry={reload} />}

      {loading ? (
        <Skeleton />
      ) : view === 'list' ? (
        <>
          <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
            {(['all', ...STATUSES] as const).map((s) => {
              const count = s === 'all' ? tasks.length : tasks.filter((t) => t.status === s).length
              return (
                <button
                  key={s}
                  className={`min-h-10 shrink-0 rounded-full px-3 text-sm ${
                    filter === s ? 'bg-blue-700 text-white' : 'bg-white text-gray-700 ring-1 ring-gray-300'
                  }`}
                  onClick={() => setFilter(s)}
                >
                  {s === 'all' ? 'Tất cả' : STATUS_LABEL[s]} ({count})
                </button>
              )
            })}
          </div>
          {visible.length === 0 ? (
            <p className="py-12 text-center text-gray-500">Không có công việc nào.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">{visible.map((t) => card(t, true))}</div>
          )}
        </>
      ) : (
        // Kanban: điện thoại cuộn ngang từng cột (snap), màn hình lớn hiện đủ 4 cột.
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
          {STATUSES.map((s) => {
            const col = tasks.filter((t) => t.status === s)
            return (
              <section key={s} className="w-[85vw] max-w-xs shrink-0 snap-start rounded-xl bg-gray-100 p-2 md:w-auto md:max-w-none">
                <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
                  {STATUS_LABEL[s]} <span className="font-normal text-gray-500">({col.length})</span>
                </h2>
                <div className="space-y-2">
                  {col.length === 0 ? <p className="px-1 py-4 text-center text-xs text-gray-400">Trống</p> : col.map((t) => card(t, false))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {hasMore && !loading && (
        <button className={`${btn.secondary} mt-4 w-full`} onClick={loadMore}>
          Tải thêm
        </button>
      )}

      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}
