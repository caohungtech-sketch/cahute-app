export interface Position {
  lat: number
  lon: number
  accuracy: number
}

// Lấy vị trí hiện tại một lần (khi nhân viên đổi trạng thái việc).
// Không bao giờ báo lỗi: bị từ chối quyền, không bắt được GPS hoặc quá thời gian → null,
// để việc đổi trạng thái vẫn diễn ra bình thường khi không có vị trí.
export function getCurrentPosition(timeoutMs = 8000): Promise<Position | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}
