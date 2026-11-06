import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AlarmClock, CircleCheck, ListTodo, Plus, Timer } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { ErrorBox, StatusBadge } from '../components/ui'
import type { StaffPoint } from '../features/map/StaffMap'
import { displayName, useProfiles } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { STATUS_LABEL } from '../lib/taskStatus'
import { useProjectMembers } from '../lib/projects'
import { formatAgo, formatDateTime, formatLongDate } from '../lib/time'
import type { TaskStatus } from '../lib/types'

// Bản đồ (Leaflet + OpenStreetMap) chỉ tải khi mở trang này.
const StaffMap = lazy(() => import('../features/map/StaffMap'))

const RECENT_MS = 2 * 60 * 60 * 1000 // vị trí gửi kèm khi đổi trạng thái việc → trong 2 giờ qua coi là "mới"
const DONE_DAYS = 7

interface Row {
  id: string
  title: string
  project_id: string
  status: TaskStatus
  due_at: string | null
  updated_at: string
}

interface LastLoc {
  user_id: string
  lat: number
  lon: number
  recorded_at: string
}

type OpenStatus = Exclude<TaskStatus, 'done'>
const OPEN: OpenStatus[] = ['todo', 'in_progress', 'paused']
const CHART_COLOR: Record<OpenStatus, string> = {
  todo: 'var(--chart-todo)',
  in_progress: 'var(--chart-in-progress)',
  paused: 'var(--chart-paused)',
}

function Card({ title, extra, children, className = '' }: { title: string; extra?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 md:p-5 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 text-base font-semibold">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

function StatTile({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

// Thanh phân bổ việc đang mở theo trạng thái; nhãn + số luôn hiện, không dựa vào màu.
function StatusBar({ counts }: { counts: Record<OpenStatus, number> }) {
  const total = OPEN.reduce((s, k) => s + counts[k], 0)
  if (!total) return <p className="text-sm text-gray-500">Không có việc đang mở.</p>
  return (
    <div>
      <div className="flex h-3 gap-0.5" role="img" aria-label={OPEN.map((k) => `${STATUS_LABEL[k]}: ${counts[k]}`).join(', ')}>
        {OPEN.filter((k) => counts[k] > 0).map((k) => (
          <div
            key={k}
            className="h-full rounded transition-opacity hover:opacity-80"
            style={{ width: `${(counts[k] / total) * 100}%`, background: CHART_COLOR[k] }}
            title={`${STATUS_LABEL[k]}: ${counts[k]} (${Math.round((counts[k] / total) * 100)}%)`}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {OPEN.map((k) => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLOR[k] }} aria-hidden />
            <span className="flex-1 text-gray-600">{STATUS_LABEL[k]}</span>
            <span className="font-semibold tabular-nums">{counts[k]}</span>
            <span className="w-10 text-right text-gray-500 tabular-nums">{Math.round((counts[k] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DashboardPage() {
  const { managedProjects } = useAuth()
  const { byId } = useProfiles()
  const projectIds = useMemo(() => managedProjects.map((t) => t.id), [managedProjects])
  const { members } = useProjectMembers(projectIds)

  const [rows, setRows] = useState<Row[] | null>(null)
  const [locs, setLocs] = useState<LastLoc[]>([])
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(async () => {
    setError(null)
    const since = new Date(Date.now() - DONE_DAYS * 86400000).toISOString()
    // Chỉ lấy việc đang mở + việc cập nhật trong 7 ngày (đủ cho các số liệu), RLS giới hạn theo quyền.
    const [t, l] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, project_id, status, due_at, updated_at')
        .or(`status.neq.done,updated_at.gte.${since}`)
        .limit(5000),
      supabase.from('last_locations').select('user_id, lat, lon, recorded_at'),
    ])
    if (t.error) return setError('Không tải được số liệu công việc. Kiểm tra kết nối mạng.')
    setRows(t.data as Row[])
    setLocs((l.data as LastLoc[]) ?? [])
    setNow(Date.now())
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Vị trí realtime (Realtime tuân theo RLS: chỉ nhận nhân viên mình quản lý)
  useEffect(() => {
    const ch = supabase
      .channel('dashboard-last-locations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'last_locations' }, (payload) => {
        const r = payload.new as LastLoc
        if (!r?.user_id) return
        setLocs((prev) => [...prev.filter((x) => x.user_id !== r.user_id), r])
        setNow(Date.now())
      })
      .subscribe()
    const tick = setInterval(() => setNow(Date.now()), 60000)
    return () => {
      supabase.removeChannel(ch)
      clearInterval(tick)
    }
  }, [])

  const stats = useMemo(() => {
    const counts: Record<OpenStatus, number> = { todo: 0, in_progress: 0, paused: 0 }
    const perProject = new Map<string, Record<OpenStatus | 'overdue', number>>()
    let overdue = 0
    let done = 0
    for (const r of rows ?? []) {
      if (r.status === 'done') {
        done++
        continue
      }
      counts[r.status]++
      const late = r.due_at !== null && new Date(r.due_at).getTime() < now
      if (late) overdue++
      const t = perProject.get(r.project_id) ?? { todo: 0, in_progress: 0, paused: 0, overdue: 0 }
      t[r.status]++
      if (late) t.overdue++
      perProject.set(r.project_id, t)
    }
    const upcoming = (rows ?? [])
      .filter((r) => r.status !== 'done' && r.due_at)
      .sort((a, b) => a.due_at!.localeCompare(b.due_at!))
      .slice(0, 6)
    return { counts, open: counts.todo + counts.in_progress + counts.paused, overdue, done, perProject, upcoming }
  }, [rows, now])

  const staffIds = useMemo(() => new Set(Object.values(members).flat()), [members])
  const points: StaffPoint[] = useMemo(
    () =>
      locs
        .map((l) => ({
          userId: l.user_id,
          name: displayName(byId.get(l.user_id)),
          lat: l.lat,
          lon: l.lon,
          recordedAt: l.recorded_at,
          recent: now - new Date(l.recorded_at).getTime() < RECENT_MS,
        }))
        .sort((a, b) => Number(b.recent) - Number(a.recent) || a.name.localeCompare(b.name, 'vi')),
    [locs, byId, now],
  )
  const recentCount = points.filter((p) => p.recent).length

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h1 className="text-xl font-bold md:text-2xl">Tổng quan</h1>
          <p className="text-sm capitalize text-gray-500">{formatLongDate(new Date(now))}</p>
        </div>
        {managedProjects.length > 0 && (
          <Link
            to="/tasks/new"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
          >
            <Plus className="h-4 w-4" aria-hidden /> Tạo việc
          </Link>
        )}
      </div>

      {error && <ErrorBox message={error} onRetry={load} />}

      {!error && rows === null ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Đang tải">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      ) : (
        !error && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Việc đang mở" value={stats.open} tone="bg-indigo-100 text-indigo-700" icon={<ListTodo className="h-5 w-5" />} />
            <StatTile label="Đang làm" value={stats.counts.in_progress} tone="bg-blue-100 text-blue-700" icon={<Timer className="h-5 w-5" />} />
            <StatTile label="Quá hạn" value={stats.overdue} tone="bg-red-100 text-red-700" icon={<AlarmClock className="h-5 w-5" />} />
            <StatTile
              label={`Hoàn thành ${DONE_DAYS} ngày`}
              value={stats.done}
              tone="bg-green-100 text-green-700"
              icon={<CircleCheck className="h-5 w-5" />}
            />
          </div>
        )
      )}

      <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
        <Card
          title="Vị trí nhân viên"
          className="lg:col-span-2"
          extra={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800">
              <span className="h-2 w-2 rounded-full bg-green-600" aria-hidden />
              {recentCount}/{staffIds.size || points.length} có vị trí trong 2 giờ qua
            </span>
          }
        >
          <div className="h-72 overflow-hidden rounded-xl bg-gray-100 md:h-96">
            <Suspense fallback={<div className="h-full animate-pulse bg-gray-100" />}>
              <StaffMap points={points} />
            </Suspense>
          </div>
          {points.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Chưa có vị trí nào. Vị trí được ghi khi nhân viên đổi trạng thái việc trên điện thoại (cần cho phép dùng vị trí).</p>
          ) : (
            <ul className="mt-3 grid gap-x-4 sm:grid-cols-2">
              {points.slice(0, 8).map((p) => (
                <li key={p.userId} className="flex min-h-10 items-center gap-2 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${p.recent ? 'bg-green-600' : 'bg-gray-400'}`} aria-hidden />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-gray-500">{formatAgo(p.recordedAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4 md:space-y-6">
          <Card title="Việc đang mở theo trạng thái">
            {rows && <StatusBar counts={stats.counts} />}
          </Card>

          <Card
            title="Sắp đến hạn"
            extra={
              <Link to="/tasks" className="text-sm font-medium text-indigo-700 hover:underline">
                Xem tất cả
              </Link>
            }
          >
            {rows && stats.upcoming.length === 0 && <p className="text-sm text-gray-500">Không có việc nào có hạn.</p>}
            <ul className="-mx-2">
              {stats.upcoming.map((t) => {
                const late = new Date(t.due_at!).getTime() < now
                return (
                  <li key={t.id}>
                    <Link to={`/tasks/${t.id}`} className="flex min-h-12 items-center gap-2 rounded-lg px-2 hover:bg-gray-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.title}</span>
                        <span className={`text-xs ${late ? 'font-medium text-red-600' : 'text-gray-500'}`}>
                          {late ? 'Quá hạn · ' : ''}
                          {formatDateTime(t.due_at!)}
                        </span>
                      </span>
                      <StatusBadge status={t.status} />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        </div>
      </div>

      {managedProjects.length > 0 && rows && (
        <Card title="Theo dự án">
          <div className="-mx-4 overflow-x-auto md:-mx-5">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium md:px-5">Dự án</th>
                  {OPEN.map((k) => (
                    <th key={k} className="px-3 py-2 text-right font-medium">
                      {STATUS_LABEL[k]}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right font-medium md:px-5">Quá hạn</th>
                </tr>
              </thead>
              <tbody>
                {managedProjects.map((project) => {
                  const t = stats.perProject.get(project.id) ?? { todo: 0, in_progress: 0, paused: 0, overdue: 0 }
                  return (
                    <tr key={project.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-medium md:px-5">{project.name}</td>
                      {OPEN.map((k) => (
                        <td key={k} className="px-3 py-3 text-right tabular-nums">
                          {t[k]}
                        </td>
                      ))}
                      <td className={`px-4 py-3 text-right tabular-nums md:px-5 ${t.overdue ? 'font-semibold text-red-600' : ''}`}>
                        {t.overdue}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
