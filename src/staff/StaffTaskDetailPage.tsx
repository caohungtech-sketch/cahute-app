import { Block, BlockTitle, Button, List, ListInput, ListItem, Navbar, NavbarBackLink } from 'konsta/react'
import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { ErrorBox, Skeleton, StatusBadge } from '../components/ui'
import Comments from '../features/tasks/Comments'
import { useTask } from '../features/tasks/useTask'
import { displayName, useProfiles } from '../lib/profiles'
import { actionLabel, STAFF_TRANSITIONS } from '../lib/taskStatus'
import { formatDateTime } from '../lib/time'
import type { TaskStatus } from '../lib/types'
import StaffToast from './StaffToast'

// Chi tiết việc của nhân viên (Konsta UI). Chỉ sửa được Kết quả và đổi trạng thái theo luật trong DB.
export default function StaffTaskDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { byId } = useProfiles()
  const { task, loading, error, reload, updateStatus, saveResult } = useTask(id)
  const [resultDraft, setResultDraft] = useState<string | null>(null) // null = chưa sửa
  const [saving, setSaving] = useState(false)
  const [now] = useState(() => Date.now()) // mốc "quá hạn", lấy một lần khi mở trang
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])

  const back = <NavbarBackLink text="Việc của tôi" onClick={() => navigate('/tasks')} />

  if (loading)
    return (
      <>
        <Navbar left={back} />
        <Block>
          <Skeleton rows={2} />
        </Block>
      </>
    )

  if (!task)
    return (
      <>
        <Navbar left={back} />
        <Block>
          <ErrorBox
            message={error ?? 'Không tìm thấy công việc, hoặc bạn không còn được giao việc này.'}
            onRetry={() => void reload()}
          />
        </Block>
      </>
    )

  const uid = session!.user.id
  const isAssignee = task.task_assignees.some((a) => a.user_id === uid)
  const options = isAssignee ? STAFF_TRANSITIONS[task.status] : []
  const overdue = task.due_at && task.status !== 'done' && new Date(task.due_at).getTime() < now
  const result = resultDraft ?? task.result
  const dirty = resultDraft !== null && resultDraft.trim() !== task.result

  async function change(next: TaskStatus) {
    const err = await updateStatus(next, { withLocation: true }) // nhân viên: gửi kèm vị trí hiện tại
    if (err) setToast(err)
  }

  async function save() {
    setSaving(true)
    const err = await saveResult(result.trim())
    setSaving(false)
    if (err) return setToast(err)
    setResultDraft(null)
    setToast('Đã lưu kết quả.')
  }

  const names = task.task_assignees.map((a) => displayName(byId.get(a.user_id))).join(', ')

  return (
    <>
      <Navbar left={back} title="Chi tiết việc" />

      <Block strong inset className="!mb-3 !mt-6 space-y-2">
        <div className="flex items-start gap-2">
          <h1 className="flex-1 break-words text-lg font-semibold leading-snug">{task.title}</h1>
          <StatusBadge status={task.status} />
        </div>
      </Block>

      <List strong inset dividers className="!my-3">
        <ListItem title="Hạn" after={
          <span className={overdue ? 'font-semibold text-red-600' : undefined}>
            {task.due_at ? formatDateTime(task.due_at) : '—'}
            {overdue && ' (quá hạn)'}
          </span>
        } />
        <ListItem title="Người giao" after={displayName(byId.get(task.created_by ?? ''))} />
        <ListItem title="Người làm" after={<span className="whitespace-normal text-right">{names || '—'}</span>} />
      </List>

      <BlockTitle>Mô tả</BlockTitle>
      <Block strong inset className="whitespace-pre-wrap break-words">
        {task.description || '—'}
      </Block>

      <BlockTitle>Kết quả</BlockTitle>
      {isAssignee ? (
        <List strong inset>
          <ListInput
            type="textarea"
            placeholder="Ghi kết quả thực hiện…"
            value={result}
            maxLength={4000}
            onChange={(e: { target: { value: string } }) => setResultDraft(e.target.value)}
            inputClassName="!h-28 resize-none !text-base"
          />
        </List>
      ) : (
        <Block strong inset className="whitespace-pre-wrap break-words">
          {task.result || '—'}
        </Block>
      )}

      {dirty && (
        <Block className="!my-3 flex gap-2">
          <Button large rounded tonal disabled={saving} onClick={() => setResultDraft(null)}>
            Huỷ
          </Button>
          <Button large rounded disabled={saving} onClick={save}>
            {saving ? 'Đang lưu…' : 'Lưu kết quả'}
          </Button>
        </Block>
      )}

      {options.length > 0 && (
        <>
          <BlockTitle>Cập nhật trạng thái</BlockTitle>
          <Block className="flex gap-2">
            {options.map((s) => (
              <Button key={s} large rounded tonal={s !== 'done'} onClick={() => change(s)}>
                {actionLabel(task.status, s)}
              </Button>
            ))}
          </Block>
        </>
      )}

      <div className="px-4">
        <Comments taskId={task.id} userId={uid} profilesById={byId} />
      </div>

      <StaffToast message={toast} onClose={closeToast} />
    </>
  )
}
