// DB lưu UTC; chỉ đổi sang giờ Việt Nam (UTC+7, không có giờ mùa hè) khi hiển thị/nhập.
const TZ = 'Asia/Ho_Chi_Minh'

const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso))
}

const clockFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const longDateFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TZ,
  weekday: 'long',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

// "14:05" theo giờ VN
export function formatClock(d: Date): string {
  return clockFmt.format(d)
}

// "thứ năm, 05/11/2026"
export function formatLongDate(d: Date): string {
  return longDateFmt.format(d)
}

// "3 phút trước", "2 giờ trước"…
export function formatAgo(iso: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000))
  if (min < 1) return 'vừa xong'
  if (min < 60) return `${min} phút trước`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} giờ trước`
  return `${Math.round(h / 24)} ngày trước`
}

// ISO (UTC) → giá trị cho <input type="datetime-local"> theo giờ VN
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

// Giá trị <input type="datetime-local"> (giờ VN) → ISO UTC
export function fromLocalInput(value: string): string | null {
  return value ? new Date(`${value}:00+07:00`).toISOString() : null
}
