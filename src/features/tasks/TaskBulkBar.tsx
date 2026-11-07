import { useQueryClient } from '@tanstack/react-query'
import { Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { displayName } from '../../lib/profiles'
import { useProjectMembers } from '../../lib/projects'
import { supabase } from '../../lib/supabase'
import { STATUS_LABEL, STATUSES } from '../../lib/taskStatus'
import type { Profile, Task, TaskStatus } from '../../lib/types'
import { setTaskStatus } from './api'
import { TASKS_KEY } from './useTasks'

interface Props {
  tasks: Task[] // các việc đang chọn (chỉ việc thuộc dự án mình quản lý)
  profilesById: Map<string, Profile>
  onMessage: (message: string) => void
  onClear: () => void
}

const selectCls = 'min-h-10 rounded-lg border border-gray-300 bg-white px-2 text-sm disabled:opacity-50'

// Thao tác hàng loạt trên các việc đã chọn. Database vẫn kiểm tra quyền và luật cho từng việc;
// việc nào bị từ chối thì báo lại số lượng.
export default function TaskBulkBar({ tasks, profilesById, onMessage, onClear }: Props) {
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(false)
  const projectIds = [...new Set(tasks.map((t) => t.project_id))]
  const { members } = useProjectMembers(projectIds)

  // Người giao thêm được: thành viên của ít nhất một dự án trong các việc đã chọn
  const candidates = [...new Set(projectIds.flatMap((id) => members[id] ?? []))]
    .map((id) => profilesById.get(id))
    .filter((p): p is Profile => !!p && !p.deleted_at)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), 'vi'))

  async function run(action: () => Promise<string>) {
    setBusy(true)
    try {
      onMessage(await action())
    } finally {
      setBusy(false)
      onClear()
      queryClient.invalidateQueries({ queryKey: TASKS_KEY })
    }
  }

  const changeStatus = (next: TaskStatus) =>
    run(async () => {
      const targets = tasks.filter((t) => t.status !== next)
      const errors = (await Promise.all(targets.map((t) => setTaskStatus(t.id, next)))).filter(Boolean)
      const ok = targets.length - errors.length
      let msg = `Đã chuyển ${ok} việc sang "${STATUS_LABEL[next]}".`
      if (errors.length) msg += ` ${errors.length} việc không chuyển được: ${errors[0]}`
      return msg
    })

  const assign = (userId: string) =>
    run(async () => {
      const name = displayName(profilesById.get(userId))
      const rows = tasks
        .filter((t) => (members[t.project_id] ?? []).includes(userId) && !t.task_assignees.some((a) => a.user_id === userId))
        .map((t) => ({ task_id: t.id, user_id: userId }))
      const skipped = tasks.length - rows.length
      const skipNote = skipped ? ` Bỏ qua ${skipped} việc (đã giao cho người này hoặc người này không thuộc dự án của việc).` : ''
      if (!rows.length) return `Không có việc nào để giao cho ${name}.${skipNote}`
      const { error } = await supabase.from('task_assignees').insert(rows)
      if (error) return `Không giao được việc: ${error.message}`
      return `Đã giao ${name} cho ${rows.length} việc.${skipNote}`
    })

  async function remove() {
    if (!confirm(`Xoá ${tasks.length} việc đã chọn? Toàn bộ bình luận và ảnh liên quan cũng bị xoá. Không hoàn tác được.`)) return
    await run(async () => {
      const { data, error } = await supabase
        .from('tasks')
        .delete()
        .in('id', tasks.map((t) => t.id))
        .select('id')
      if (error) return `Không xoá được: ${error.message}`
      const failed = tasks.length - (data?.length ?? 0)
      return `Đã xoá ${data?.length ?? 0} việc.${failed ? ` ${failed} việc không xoá được (không có quyền).` : ''}`
    })
  }

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 p-2 text-sm ring-1 ring-indigo-200"
      role="toolbar"
      aria-label="Thao tác với các việc đã chọn"
    >
      <span className="px-2 font-semibold text-indigo-900">Đã chọn {tasks.length} việc</span>

      <select
        className={selectCls}
        value=""
        disabled={busy}
        onChange={(e) => changeStatus(e.target.value as TaskStatus)}
        aria-label="Đổi trạng thái các việc đã chọn"
      >
        <option value="" disabled>
          Đổi trạng thái…
        </option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      <select
        className={selectCls}
        value=""
        disabled={busy || candidates.length === 0}
        onChange={(e) => assign(e.target.value)}
        aria-label="Giao thêm người cho các việc đã chọn"
      >
        <option value="" disabled>
          {candidates.length ? 'Giao thêm người…' : 'Dự án chưa có nhân viên'}
        </option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {displayName(p)}
          </option>
        ))}
      </select>

      <button
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-white px-3 font-medium text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-50"
        disabled={busy}
        onClick={remove}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Xoá
      </button>

      <span className="flex-1" />
      {busy && <span className="text-indigo-800">Đang xử lý…</span>}
      <button
        className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-gray-700 hover:bg-white disabled:opacity-50"
        disabled={busy}
        onClick={onClear}
      >
        <X className="h-4 w-4" aria-hidden />
        Bỏ chọn
      </button>
    </div>
  )
}
