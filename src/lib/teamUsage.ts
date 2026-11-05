// Đếm số lần quản lý tạo việc trong từng nhóm để chọn nhóm mặc định.
// Lưu ở localStorage theo user: không tốn truy vấn DB; chỉ là tiện ích nên mất dữ liệu cũng không sao.
type Usage = Record<string, number>

const key = (uid: string) => `teamUsage.${uid}`

function read(uid: string): Usage {
  try {
    return JSON.parse(localStorage.getItem(key(uid)) ?? '{}') as Usage
  } catch {
    return {}
  }
}

export function recordTeamUse(uid: string, teamId: string) {
  if (!teamId) return
  const usage = read(uid)
  usage[teamId] = (usage[teamId] ?? 0) + 1
  try {
    localStorage.setItem(key(uid), JSON.stringify(usage))
  } catch {
    /* bỏ qua */
  }
}

// Nhóm dùng nhiều nhất trong số teamIds; chưa có lịch sử thì trả về null.
export function mostUsedTeam(uid: string, teamIds: string[]): string | null {
  const usage = read(uid)
  let best: string | null = null
  for (const id of teamIds) if ((usage[id] ?? 0) > (best ? usage[best] : 0)) best = id
  return best
}
