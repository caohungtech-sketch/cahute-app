import { displayName } from '../../lib/profiles'
import { supabase } from '../../lib/supabase'
import { useProjectMembers } from '../../lib/projects'
import type { Profile, Task } from '../../lib/types'

interface Props {
  task: Task
  canEdit: boolean // quản lý của dự án
  profilesById: Map<string, Profile>
  onChanged: () => void
  onError: (message: string) => void
}

// Người làm dạng chip. Quản lý: × để gỡ, "+ Thêm" để giao thêm người trong dự án của việc.
export default function AssigneeChips({ task, canEdit, profilesById, onChanged, onError }: Props) {
  const { members } = useProjectMembers(canEdit ? [task.project_id] : [])
  const assigned = task.task_assignees.map((a) => a.user_id)
  const addable = (members[task.project_id] ?? []).filter((id) => !assigned.includes(id))

  async function add(userId: string) {
    const { error } = await supabase.from('task_assignees').insert({ task_id: task.id, user_id: userId })
    if (error) onError(error.message)
    onChanged()
  }

  async function remove(userId: string) {
    if (!confirm(`Gỡ ${displayName(profilesById.get(userId))} khỏi việc này?`)) return
    const { error } = await supabase.from('task_assignees').delete().eq('task_id', task.id).eq('user_id', userId)
    if (error) onError(error.message)
    onChanged()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {assigned.length === 0 && !canEdit && <span className="text-gray-500">Chưa giao cho ai</span>}

      {assigned.map((uid) => (
        <span key={uid} className="inline-flex min-h-9 items-center rounded-full bg-indigo-50 pl-3 text-sm text-indigo-900 ring-1 ring-indigo-200">
          {displayName(profilesById.get(uid))}
          {canEdit ? (
            <button
              className="flex h-9 w-9 items-center justify-center rounded-full text-indigo-700 active:bg-indigo-100"
              aria-label={`Gỡ ${displayName(profilesById.get(uid))}`}
              onClick={() => remove(uid)}
            >
              ×
            </button>
          ) : (
            <span className="w-3" />
          )}
        </span>
      ))}

      {canEdit && addable.length > 0 && (
        <select
          className="min-h-9 rounded-full border border-dashed border-gray-400 bg-white px-3 text-sm text-gray-700"
          value=""
          onChange={(e) => e.target.value && add(e.target.value)}
          aria-label="Thêm người làm"
        >
          <option value="">+ Thêm người</option>
          {addable.map((id) => (
            <option key={id} value={id}>
              {displayName(profilesById.get(id))}
            </option>
          ))}
        </select>
      )}
      {canEdit && addable.length === 0 && assigned.length === 0 && (
        <span className="text-sm text-gray-500">Dự án chưa có thành viên</span>
      )}
    </div>
  )
}
