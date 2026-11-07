import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/shadcn/table'
import { StatusBadge } from '../../components/ui'
import { displayName } from '../../lib/profiles'
import { actionLabel, STAFF_TRANSITIONS } from '../../lib/taskStatus'
import { formatDateTime } from '../../lib/time'
import type { Profile, Task, TaskStatus } from '../../lib/types'
import TaskBulkBar from './TaskBulkBar'
import { DEFAULT_SORT, type TaskSort, type TaskSortKey } from './useTaskPage'

interface Props {
  rows: Task[]
  sort: TaskSort
  onSortChange: (sort: TaskSort) => void
  profilesById: Map<string, Profile>
  canChange: (t: Task) => boolean // đổi trạng thái từng việc
  canManage: (t: Task) => boolean // quản lý dự án của việc → chọn được để thao tác hàng loạt
  onChangeStatus: (t: Task, next: TaskStatus) => void
  onMessage: (message: string) => void
}

// Ô tích có vùng chạm 40px. Dùng role="checkbox" mặc định của input để TableHead/TableCell căn lề đúng.
function Check({ checked, indeterminate = false, disabled, onChange, label }: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label className={`grid h-10 w-10 place-items-center ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="h-4 w-4 cursor-pointer accent-indigo-700 disabled:cursor-default"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate
        }}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
    </label>
  )
}

// Bảng công việc trên máy tính (shadcn Table + TanStack Table). Sắp xếp (chỉ cột có accessorKey) và phân trang làm ở server,
// TanStack chỉ giữ trạng thái sắp xếp và các dòng đang chọn. Chọn dòng chỉ trong trang đang xem;
// component cha đổi `key` khi đổi trang/bộ lọc để bỏ chọn.
export default function TaskDataTable({ rows, sort, onSortChange, profilesById, canChange, canManage, onChangeStatus, onMessage }: Props) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const sorting: SortingState = useMemo(() => [{ id: sort.key, desc: sort.desc }], [sort])

  const columns = useMemo<ColumnDef<Task>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Check
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            disabled={!table.getRowModel().rows.some((r) => r.getCanSelect())}
            onChange={(v) => table.toggleAllPageRowsSelected(v)}
            label="Chọn tất cả việc trong trang"
          />
        ),
        cell: ({ row }) => (
          <Check
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={(v) => row.toggleSelected(v)}
            label={`Chọn việc ${row.original.title}`}
          />
        ),
      },
      {
        accessorKey: 'title',
        header: 'Công việc',
        cell: ({ row: { original: t } }) => (
          <Link to={`/tasks/${t.id}`} className="line-clamp-2 font-medium text-indigo-800 hover:underline">
            {t.title}
          </Link>
        ),
        meta: { className: 'max-w-xs whitespace-normal' },
      },
      {
        accessorKey: 'status',
        header: 'Trạng thái',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'assignees',
        header: 'Người làm',
        cell: ({ row: { original: t } }) => (
          <span className="line-clamp-2">
            {t.task_assignees.length ? t.task_assignees.map((a) => displayName(profilesById.get(a.user_id))).join(', ') : '—'}
          </span>
        ),
        meta: { className: 'max-w-48 whitespace-normal text-gray-700' },
      },
      {
        id: 'result',
        header: 'Kết quả',
        cell: ({ row: { original: t } }) => (
          <span className="line-clamp-2" title={t.result}>
            {t.result || '—'}
          </span>
        ),
        meta: { className: 'max-w-56 whitespace-normal text-gray-700' },
      },
      {
        accessorKey: 'due_at',
        header: 'Hạn',
        cell: ({ row: { original: t } }) => {
          const overdue = t.due_at && t.status !== 'done' && new Date(t.due_at) < new Date()
          return (
            <span className={overdue ? 'font-semibold text-red-700' : 'text-gray-700'}>
              {t.due_at ? formatDateTime(t.due_at) : '—'}
            </span>
          )
        },
      },
      {
        accessorKey: 'updated_at',
        header: 'Cập nhật',
        cell: ({ row }) => <span className="text-gray-500">{formatDateTime(row.original.updated_at)}</span>,
      },
      {
        id: 'actions',
        header: 'Thao tác',
        cell: ({ row: { original: t } }) => (
          <div className="flex gap-1">
            {(canChange(t) ? STAFF_TRANSITIONS[t.status] : []).map((s) => (
              <button
                key={s}
                className={`min-h-10 whitespace-nowrap rounded-lg px-2 text-xs font-medium ${
                  s === 'done' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
                onClick={() => onChangeStatus(t, s)}
              >
                {actionLabel(t.status, s)}
              </button>
            ))}
          </div>
        ),
      },
    ],
    [profilesById, canChange, onChangeStatus],
  )

  function handleSorting(updater: Updater<SortingState>) {
    const next = typeof updater === 'function' ? updater(sorting) : updater
    onSortChange(next[0] ? { key: next[0].id as TaskSortKey, desc: next[0].desc } : DEFAULT_SORT)
  }

  // Luật này chỉ liên quan tới React Compiler (dự án không bật); TanStack Table v8 chạy bình thường.
  // oxlint-disable-next-line react/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (t) => t.id,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    enableSortingRemoval: false,
    enableRowSelection: (row) => canManage(row.original),
    state: { sorting, rowSelection },
    onSortingChange: handleSorting,
    onRowSelectionChange: setRowSelection,
  })

  const selected = table.getSelectedRowModel().rows.map((r) => r.original)

  return (
    <>
      {selected.length > 0 && (
        <TaskBulkBar
          tasks={selected}
          profilesById={profilesById}
          onMessage={onMessage}
          onClear={() => setRowSelection({})}
        />
      )}

      <div className="overflow-hidden rounded-xl bg-white ring-1 ring-gray-200">
        <Table>
          <TableHeader className="bg-gray-50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted()
                  const label = flexRender(h.column.columnDef.header, h.getContext())
                  return (
                    <TableHead
                      key={h.id}
                      className="px-3 text-xs uppercase text-gray-500"
                      aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {h.column.getCanSort() ? (
                        <button
                          className="-mx-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 uppercase hover:bg-gray-100 hover:text-gray-800"
                          onClick={h.column.getToggleSortingHandler()}
                          title="Sắp xếp"
                        >
                          {label}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-indigo-700" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-indigo-700" aria-hidden />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
                          )}
                        </button>
                      ) : (
                        label
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className="border-gray-100 hover:bg-gray-50 data-[state=selected]:bg-indigo-50"
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={`px-3 ${(cell.column.columnDef.meta as { className?: string } | undefined)?.className ?? ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
