import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { btn, Toast } from '../components/ui'
import KanbanView from '../features/tasks/KanbanView'
import TaskTableView from '../features/tasks/TaskTableView'
import { useProfiles } from '../lib/profiles'
import type { Task } from '../lib/types'

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
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const { byId } = useProfiles()

  const isManager = profile?.role === 'manager'
  const uid = session?.user.id

  const canChange = useCallback(
    (t: Task) => managedTeams.some((m) => m.id === t.team_id) || t.task_assignees.some((a) => a.user_id === uid),
    [managedTeams, uid],
  )

  function changeView(v: View) {
    setView(v)
    try {
      localStorage.setItem('tasks.view', v)
    } catch {
      /* bỏ qua */
    }
  }

  const viewProps = { teamId: teamId || null, profilesById: byId, canChange, onError: setToast }

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

      {view === 'list' ? <TaskTableView {...viewProps} /> : <KanbanView {...viewProps} />}

      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}
