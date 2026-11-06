import { Block, Button, List, ListItem, Navbar, Segmented, SegmentedButton } from 'konsta/react'
import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { ErrorBox, Skeleton } from '../components/ui'
import QuickSearch from '../features/tasks/QuickSearch'
import { useTaskPage } from '../features/tasks/useTaskPage'
import { displayName, useProfiles } from '../lib/profiles'
import { actionLabel, STAFF_TRANSITIONS, STATUS_LABEL, STATUSES } from '../lib/taskStatus'
import { formatDateTime } from '../lib/time'
import type { Task, TaskStatus } from '../lib/types'
import StaffToast from './StaffToast'
import StatusSheet from './StatusSheet'

const PAGE_SIZE = 20

// "Việc của tôi" của nhân viên (Konsta UI, kiểu iOS). RLS chỉ trả về việc được giao cho người này.
export default function StaffTasksPage() {
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [page, setPage] = useState(0)
  const [sheetTask, setSheetTask] = useState<Task | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const closeToast = useCallback(() => setToast(null), [])
  const { byId } = useProfiles()
  const { rows, counts, total, loading, error, reload, updateStatus } = useTaskPage(null, status, page, PAGE_SIZE)

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // Việc vừa đổi trạng thái/bị gỡ làm số trang giảm → lùi về trang cuối.
  if (!loading && page > pages - 1) setPage(pages - 1)

  function pickStatus(s: TaskStatus) {
    setStatus(s)
    setPage(0)
  }

  async function change(task: Task, next: TaskStatus) {
    const err = await updateStatus(task, next)
    if (err) setToast(err)
  }

  // Một bước thì đổi luôn; nhiều bước (Đang làm → Tạm dừng / Hoàn thành) thì mở bảng chọn.
  function onAction(task: Task) {
    const options = STAFF_TRANSITIONS[task.status]
    if (options.length === 1) change(task, options[0])
    else setSheetTask(task)
  }

  const [now] = useState(() => Date.now()) // mốc "quá hạn", lấy một lần khi mở trang

  return (
    <>
      <Navbar title="Việc của tôi" />

      <Block className="!my-3 space-y-3">
        <QuickSearch projectId={null} className="" />
        <Segmented strong rounded>
          {STATUSES.map((s) => (
            <SegmentedButton key={s} active={status === s} onClick={() => pickStatus(s)} className="!h-auto min-h-10 py-1">
              <span className="flex flex-col items-center leading-tight">
                <span className="whitespace-nowrap text-xs">{STATUS_LABEL[s]}</span>
                <span className="text-[11px] opacity-70">{counts[s]}</span>
              </span>
            </SegmentedButton>
          ))}
        </Segmented>
      </Block>

      {error && (
        <Block>
          <ErrorBox message={error} onRetry={reload} />
        </Block>
      )}

      {loading ? (
        <Block>
          <Skeleton />
        </Block>
      ) : rows.length === 0 ? (
        <Block className="py-8 text-center text-gray-500">Không có việc nào ở mục "{STATUS_LABEL[status]}".</Block>
      ) : (
        <List strong inset dividers className="!my-3">
          {rows.map((t) => {
            const overdue = t.due_at && t.status !== 'done' && new Date(t.due_at).getTime() < now
            const others = t.task_assignees.length > 1 ? t.task_assignees.map((a) => displayName(byId.get(a.user_id))).join(', ') : null
            const options = STAFF_TRANSITIONS[t.status]
            return (
              <ListItem
                key={t.id}
                link
                linkComponent={Link as unknown as string}
                linkProps={{ to: `/tasks/${t.id}` }}
                title={<span className="line-clamp-2 whitespace-normal font-medium">{t.title}</span>}
                subtitle={
                  t.due_at ? (
                    <span className={overdue ? 'font-semibold text-red-600' : undefined}>
                      Hạn: {formatDateTime(t.due_at)}
                      {overdue && ' (quá hạn)'}
                    </span>
                  ) : undefined
                }
                text={t.result ? `Kết quả: ${t.result}` : others ? `Cùng làm: ${others}` : undefined}
              >
                {options.length > 0 && (
                  <div className="px-4 pb-3">
                    <Button small rounded tonal={options[0] !== 'done'} onClick={() => onAction(t)} className="!h-10 !w-auto px-4">
                      {options.length === 1 ? actionLabel(t.status, options[0]) : 'Cập nhật trạng thái'}
                    </Button>
                  </div>
                )}
              </ListItem>
            )
          })}
        </List>
      )}

      {total > PAGE_SIZE && (
        <Block className="flex items-center justify-between gap-2">
          <Button small rounded outline className="!h-10 !w-auto px-4" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ‹ Trước
          </Button>
          <span className="text-sm text-gray-600">
            Trang {page + 1} / {pages}
          </span>
          <Button small rounded outline className="!h-10 !w-auto px-4" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            Sau ›
          </Button>
        </Block>
      )}

      <StatusSheet task={sheetTask} onClose={() => setSheetTask(null)} onPick={change} />
      <StaffToast message={toast} onClose={closeToast} />
    </>
  )
}
