import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Toast } from '../components/ui'
import KanbanView from '../features/tasks/KanbanView'
import TaskTableView from '../features/tasks/TaskTableView'
import { useProfiles } from '../lib/profiles'
import { mostUsedProject } from '../lib/projectUsage'
import { useIsMobile } from '../lib/useIsMobile'
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
  const { session, profile, managedProjects } = useAuth()
  const [view, setView] = useState<View>(readView)
  const uid = session?.user.id
  // Mặc định: dự án quản lý tương tác nhiều nhất (chưa có lịch sử → Tất cả dự án)
  const [projectId, setProjectId] = useState(() =>
    managedProjects.length > 1 && uid ? (mostUsedProject(uid, managedProjects.map((t) => t.id)) ?? '') : '',
  )
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const { byId } = useProfiles()
  const isMobile = useIsMobile()

  const isManager = profile?.role === 'manager'

  const canChange = useCallback(
    (t: Task) => managedProjects.some((m) => m.id === t.project_id) || t.task_assignees.some((a) => a.user_id === uid),
    [managedProjects, uid],
  )

  function changeView(v: View) {
    setView(v)
    try {
      localStorage.setItem('tasks.view', v)
    } catch {
      /* bỏ qua */
    }
  }

  const viewProps = { projectId: projectId || null, profilesById: byId, canChange, onError: setToast }
  const effectiveView: View = isMobile ? 'list' : view // điện thoại chỉ có danh sách
  const showToolbar = !isMobile || managedProjects.length > 1

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h1 className="flex-1 text-lg font-bold md:text-xl">{isManager ? 'Công việc' : 'Việc của tôi'}</h1>
        {isManager && managedProjects.length > 0 && (
          <Link
            to={projectId ? `/tasks/new?project=${projectId}` : '/tasks/new'}
            className="inline-flex min-h-10 items-center rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white active:bg-blue-800 md:min-h-12 md:px-4 md:text-base"
          >
            + Tạo việc
          </Link>
        )}
      </div>

      {showToolbar && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {!isMobile && (
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
          )}
          {managedProjects.length > 1 && (
            <select
              className="min-h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm md:min-h-12 md:w-auto"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-label="Lọc theo dự án"
            >
              <option value="">Tất cả dự án</option>
              {managedProjects.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {isManager && managedProjects.length === 0 && (
        <div className="mb-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-900 ring-1 ring-blue-200">
          Bạn chưa quản lý dự án nào. Vào{' '}
          <Link to="/projects" className="font-semibold underline">
            Dự án
          </Link>{' '}
          để tạo dự án và thêm nhân viên trước khi giao việc.
        </div>
      )}

      {effectiveView === 'list' ? <TaskTableView {...viewProps} /> : <KanbanView {...viewProps} />}

      <Toast message={toast} onClose={closeToast} />
    </div>
  )
}
