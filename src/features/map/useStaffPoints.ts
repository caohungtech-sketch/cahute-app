import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { displayName, useProfiles } from '../../lib/profiles'
import { supabase } from '../../lib/supabase'
import type { StaffPoint } from './StaffMap'

const RECENT_MS = 2 * 60 * 60 * 1000 // vị trí gửi kèm khi đổi trạng thái việc → trong 2 giờ qua coi là "mới"
const KEY = ['last_locations']
const EMPTY: LastLoc[] = []

interface LastLoc {
  user_id: string
  lat: number
  lon: number
  recorded_at: string
}

// Vị trí gần nhất của nhân viên (RLS: chỉ nhân viên mình quản lý), cập nhật theo Realtime.
// Dùng chung cho trang Tổng quan và trang bản đồ riêng (/map).
export function useStaffPoints(channelName: string) {
  const queryClient = useQueryClient()
  const { byId } = useProfiles()
  const [now, setNow] = useState(() => Date.now())

  const { data: locs = EMPTY, error, refetch } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('last_locations').select('user_id, lat, lon, recorded_at')
      if (error) throw error
      return data as LastLoc[]
    },
  })

  useEffect(() => {
    const ch = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'last_locations' }, (payload) => {
        const r = payload.new as LastLoc
        if (!r?.user_id) return
        queryClient.setQueryData<LastLoc[]>(KEY, (prev = []) => [...prev.filter((x) => x.user_id !== r.user_id), r])
        setNow(Date.now())
      })
      .subscribe()
    const tick = setInterval(() => setNow(Date.now()), 60000) // "x phút trước", trạng thái "mới"
    return () => {
      supabase.removeChannel(ch)
      clearInterval(tick)
    }
  }, [channelName, queryClient])

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

  return { points, now, error: error ? 'Không tải được vị trí nhân viên. Kiểm tra kết nối mạng.' : null, reload: refetch }
}
