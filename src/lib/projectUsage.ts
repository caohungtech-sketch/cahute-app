// Đếm số lần quản lý tạo việc trong từng dự án để chọn dự án mặc định.
// Lưu ở localStorage theo user: không tốn truy vấn DB; chỉ là tiện ích nên mất dữ liệu cũng không sao.
type Usage = Record<string, number>

const key = (uid: string) => `projectUsage.${uid}`

function read(uid: string): Usage {
  try {
    return JSON.parse(localStorage.getItem(key(uid)) ?? '{}') as Usage
  } catch {
    return {}
  }
}

export function recordProjectUse(uid: string, projectId: string) {
  if (!projectId) return
  const usage = read(uid)
  usage[projectId] = (usage[projectId] ?? 0) + 1
  try {
    localStorage.setItem(key(uid), JSON.stringify(usage))
  } catch {
    /* bỏ qua */
  }
}

// Dự án dùng nhiều nhất trong số projectIds; chưa có lịch sử thì trả về null.
export function mostUsedProject(uid: string, projectIds: string[]): string | null {
  const usage = read(uid)
  let best: string | null = null
  for (const id of projectIds) if ((usage[id] ?? 0) > (best ? usage[best] : 0)) best = id
  return best
}
