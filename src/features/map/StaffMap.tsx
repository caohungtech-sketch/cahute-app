import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import { formatAgo } from '../../lib/time'

// Bản đồ vị trí nhân viên: Leaflet + OpenStreetMap (miễn phí, không cần API key).
// Chỉ tải khi mở trang Tổng quan (lazy import ở trang cha), CSS của Leaflet đi kèm phần tải riêng này.

export interface StaffPoint {
  userId: string
  name: string
  lat: number
  lon: number
  recordedAt: string
  recent: boolean // có vị trí trong 2 giờ qua
}

const DEFAULT_CENTER: L.LatLngTuple = [16.0544, 108.2022] // Việt Nam (Đà Nẵng)

// Ô bản đồ: máy chủ cộng đồng OpenStreetMap France (dữ liệu OSM, có nhãn tiếng Việt).
// - Không dùng tile.openstreetmap.org: DNS của VNPT không phân giải được tên miền openstreetmap.org.
// - Không dùng CARTO: giờ cần API key, không có key thì trả ô "API KEY REQUIRED".
// Phải giữ dòng ghi nguồn; chỉ hợp lượng truy cập nhỏ.
const TILE_URL = 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://www.openstreetmap.fr/">OpenStreetMap France</a>'

export default function StaffMap({ points }: { points: StaffPoint[] }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef(new Map<string, L.CircleMarker>())
  const fittedRef = useRef(false)

  useEffect(() => {
    if (!elRef.current) return
    const map = L.map(elRef.current, { center: DEFAULT_CENTER, zoom: 6 })
    L.tileLayer(TILE_URL, { maxZoom: 19, subdomains: 'abc', attribution: ATTRIBUTION }).addTo(map)
    mapRef.current = map
    const markers = markersRef.current
    return () => {
      map.remove()
      mapRef.current = null
      markers.clear()
      fittedRef.current = false
    }
  }, [])

  // Cập nhật marker khi vị trí thay đổi (Realtime ở trang cha)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current
    const seen = new Set<string>()

    for (const p of points) {
      seen.add(p.userId)
      const color = p.recent ? '#16a34a' : '#94a3b8'
      let m = markers.get(p.userId)
      if (!m) {
        m = L.circleMarker([p.lat, p.lon], { radius: 9, weight: 2, color: '#ffffff', fillOpacity: 1 }).addTo(map)
        markers.set(p.userId, m)
      }
      m.setLatLng([p.lat, p.lon])
      m.setStyle({ fillColor: color })
      // textContent: tên người dùng không bị hiểu là HTML
      const info = document.createElement('div')
      const b = document.createElement('strong')
      b.textContent = p.name
      const t = document.createElement('div')
      t.textContent = `Cập nhật ${formatAgo(p.recordedAt)}`
      info.append(b, t)
      m.bindPopup(info)
      m.bindTooltip(p.name)
    }
    for (const [id, m] of markers) {
      if (!seen.has(id)) {
        m.remove()
        markers.delete(id)
      }
    }

    // Lần đầu có dữ liệu: zoom vừa đủ thấy mọi nhân viên
    if (!fittedRef.current && points.length) {
      fittedRef.current = true
      if (points.length === 1) map.setView([points[0].lat, points[0].lon], 14)
      else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as L.LatLngTuple)), { padding: [48, 48] })
    }
  }, [points])

  // isolate: các lớp của Leaflet (z-index tới 1000) không đè lên thanh trên/menu của trang
  return <div ref={elRef} className="isolate h-full w-full" />
}
