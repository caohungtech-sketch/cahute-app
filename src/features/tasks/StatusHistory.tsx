import { useQuery } from '@tanstack/react-query'
import { MapPin } from 'lucide-react'
import { ErrorBox } from '../../components/ui'
import { displayName } from '../../lib/profiles'
import { supabase } from '../../lib/supabase'
import { STATUS_LABEL } from '../../lib/taskStatus'
import { formatDateTime } from '../../lib/time'
import type { Profile, TaskStatus } from '../../lib/types'
import { TASKS_KEY } from './useTasks'

interface StatusEvent {
  id: number
  user_id: string | null
  from_status: TaskStatus
  to_status: TaskStatus
  created_at: string
  lat: number | null
  lon: number | null
  accuracy: number | null
}

// Link Google Maps (không cần API key): mở được với mọi nhà mạng, trên điện thoại tự mở app Google Maps.
// Không dùng openstreetmap.org vì DNS của một số nhà mạng VN (VNPT) không phân giải được.
const mapLink = (lat: number, lon: number) => `https://www.google.com/maps?q=${lat},${lon}`

// Lịch sử đổi trạng thái của một việc (DB tự ghi qua trigger), kèm vị trí nếu nhân viên gửi.
// version: đổi khi việc thay đổi (updated_at) → tải lại lịch sử.
export default function StatusHistory({
  taskId,
  version,
  profilesById,
}: {
  taskId: string
  version: string
  profilesById: Map<string, Profile>
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: [...TASKS_KEY, 'history', taskId, version],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_status_events')
        .select('id, user_id, from_status, to_status, created_at, lat, lon, accuracy')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as StatusEvent[]
    },
  })

  return (
    <section className="mt-4 rounded-xl bg-white p-4 ring-1 ring-gray-200">
      <h2 className="mb-2 text-base font-semibold">Lịch sử trạng thái</h2>
      {isError ? (
        <ErrorBox message="Không tải được lịch sử trạng thái." onRetry={() => void refetch()} />
      ) : isPending ? (
        <p className="text-sm text-gray-500">Đang tải…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-500">Chưa đổi trạng thái lần nào.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <span className="tabular-nums text-gray-500">{formatDateTime(e.created_at)}</span>
              <span className="font-medium">{e.user_id ? displayName(profilesById.get(e.user_id)) : 'Hệ thống'}</span>
              <span className="text-gray-700">
                {STATUS_LABEL[e.from_status]} → {STATUS_LABEL[e.to_status]}
              </span>
              {e.lat !== null && e.lon !== null && (
                <a
                  href={mapLink(e.lat, e.lon)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1 text-indigo-700 hover:underline"
                >
                  <MapPin className="h-4 w-4" aria-hidden />
                  Xem vị trí{e.accuracy !== null && ` (±${Math.round(e.accuracy)} m)`}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
