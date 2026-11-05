import { btn, ErrorBox, Skeleton } from '../../components/ui'
import { STATUS_LABEL, STATUSES } from '../../lib/taskStatus'
import type { Profile, Task, TaskStatus } from '../../lib/types'
import TaskCard from './TaskCard'
import { useTasks } from './useTasks'

interface Props {
  projectId: string | null
  profilesById: Map<string, Profile>
  canChange: (t: Task) => boolean
  onError: (message: string) => void
}

export default function KanbanView({ projectId, profilesById, canChange, onError }: Props) {
  const { tasks, loading, error, hasMore, reload, loadMore, updateStatus } = useTasks(projectId)

  async function change(task: Task, next: TaskStatus) {
    const err = await updateStatus(task, next)
    if (err) onError(err)
  }

  if (loading) return <Skeleton />

  return (
    <div>
      {error && <ErrorBox message={error} onRetry={reload} />}

      {/* Điện thoại cuộn ngang từng cột (snap), màn hình lớn hiện đủ 4 cột. */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {STATUSES.map((s) => {
          const col = tasks.filter((t) => t.status === s)
          return (
            <section key={s} className="w-[85vw] max-w-xs shrink-0 snap-start rounded-xl bg-gray-100 p-2 md:w-auto md:max-w-none">
              <h2 className="mb-2 px-1 text-sm font-semibold text-gray-700">
                {STATUS_LABEL[s]} <span className="font-normal text-gray-500">({col.length})</span>
              </h2>
              <div className="space-y-2">
                {col.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-gray-400">Trống</p>
                ) : (
                  col.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      profilesById={profilesById}
                      canChangeStatus={canChange(t)}
                      showStatus={false}
                      onChangeStatus={change}
                    />
                  ))
                )}
              </div>
            </section>
          )
        })}
      </div>

      {hasMore && (
        <button className={`${btn.secondary} mt-4 w-full`} onClick={loadMore}>
          Tải thêm
        </button>
      )}
    </div>
  )
}
