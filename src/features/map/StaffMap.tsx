import { useEffect, useRef, useState } from 'react'
import { formatAgo } from '../../lib/time'

// Tải Google Maps JS API một lần, chỉ khi component bản đồ được mở (không nằm trong bundle chính).
declare global {
  interface Window {
    google?: any
    __cahuteMapsReady?: () => void
  }
}

let loader: Promise<any> | null = null

function loadGoogleMaps(key: string): Promise<any> {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      window.__cahuteMapsReady = () => resolve(window.google.maps)
      const s = document.createElement('script')
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&language=vi&region=VN&callback=__cahuteMapsReady`
      s.async = true
      s.onerror = () => {
        loader = null
        reject(new Error('Không tải được Google Maps'))
      }
      document.head.appendChild(s)
    })
  }
  return loader
}

export interface StaffPoint {
  userId: string
  name: string
  lat: number
  lon: number
  recordedAt: string
  online: boolean
}

const DEFAULT_CENTER = { lat: 16.0544, lng: 108.2022 } // Việt Nam (Đà Nẵng)

export default function StaffMap({ points, apiKey }: { points: StaffPoint[]; apiKey: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const markersRef = useRef(new Map<string, any>())
  const infoRef = useRef<any>(null)
  const fittedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !elRef.current) return
        mapRef.current = new maps.Map(elRef.current, {
          center: DEFAULT_CENTER,
          zoom: 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        })
        infoRef.current = new maps.InfoWindow()
        setReady(true)
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [apiKey])

  // Cập nhật marker khi vị trí thay đổi (Realtime ở trang cha)
  useEffect(() => {
    if (!ready) return
    const maps = window.google.maps
    const markers = markersRef.current
    const seen = new Set<string>()

    for (const p of points) {
      seen.add(p.userId)
      const position = { lat: p.lat, lng: p.lon }
      const icon = {
        path: maps.SymbolPath.CIRCLE,
        scale: 9,
        fillColor: p.online ? '#16a34a' : '#94a3b8',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      }
      let m = markers.get(p.userId)
      if (!m) {
        m = new maps.Marker({ map: mapRef.current })
        m.addListener('click', () => {
          const info = document.createElement('div')
          info.style.color = '#111827'
          const b = document.createElement('strong')
          b.textContent = m.__name
          const t = document.createElement('div')
          t.textContent = `Cập nhật ${formatAgo(m.__at)}`
          info.append(b, t)
          infoRef.current.setContent(info)
          infoRef.current.open({ map: mapRef.current, anchor: m })
        })
        markers.set(p.userId, m)
      }
      m.__name = p.name
      m.__at = p.recordedAt
      m.setPosition(position)
      m.setIcon(icon)
      m.setTitle(p.name)
    }
    for (const [id, m] of markers) {
      if (!seen.has(id)) {
        m.setMap(null)
        markers.delete(id)
      }
    }

    // Lần đầu có dữ liệu: zoom vừa đủ thấy mọi nhân viên
    if (!fittedRef.current && points.length) {
      fittedRef.current = true
      if (points.length === 1) {
        mapRef.current.setCenter({ lat: points[0].lat, lng: points[0].lon })
        mapRef.current.setZoom(14)
      } else {
        const bounds = new maps.LatLngBounds()
        points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lon }))
        mapRef.current.fitBounds(bounds, 48)
      }
    }
  }, [points, ready])

  if (error)
    return <div className="grid h-full place-items-center p-4 text-center text-sm text-gray-500">{error}. Kiểm tra mạng và API key.</div>

  return (
    <div className="relative h-full w-full">
      <div ref={elRef} className="h-full w-full" />
      {!ready && <div className="absolute inset-0 animate-pulse bg-gray-100" aria-label="Đang tải bản đồ" />}
    </div>
  )
}
