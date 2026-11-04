import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { StatusBadge } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import type { TaskStatus } from '../../lib/types'

interface Hit {
  id: string
  title: string
  status: TaskStatus
}

const MIN_CHARS = 2
const LIMIT = 8

// Escape ký tự đại diện của LIKE để người dùng gõ % hoặc _ vẫn tìm đúng.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

// Tìm nhanh theo tiêu đề, gợi ý dạng autocomplete. RLS tự giới hạn kết quả theo quyền.
export default function QuickSearch({ teamId }: { teamId: string | null }) {
  const navigate = useNavigate()
  const listId = useId()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(-1)
  const reqRef = useRef(0) // bỏ qua kết quả của lần gõ cũ trả về muộn

  useEffect(() => {
    const term = q.trim()
    if (term.length < MIN_CHARS) {
      setHits([])
      setSearching(false)
      return
    }
    setSearching(true)
    const req = ++reqRef.current
    const timer = setTimeout(async () => {
      let query = supabase
        .from('tasks')
        .select('id, title, status')
        .ilike('title', `%${escapeLike(term)}%`)
        .order('updated_at', { ascending: false })
        .limit(LIMIT)
      if (teamId) query = query.eq('team_id', teamId)
      const { data } = await query
      if (req !== reqRef.current) return
      setHits((data as Hit[]) ?? [])
      setActive(-1)
      setSearching(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [q, teamId])

  function go(hit: Hit) {
    setOpen(false)
    setQ('')
    navigate(`/tasks/${hit.id}`)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(-1, i - 1))
    } else if (e.key === 'Enter' && active >= 0 && hits[active]) {
      e.preventDefault()
      go(hits[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && q.trim().length >= MIN_CHARS

  return (
    <div className="relative mb-2">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400" aria-hidden>
        🔍
      </span>
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        // text-base (16px): nhỏ hơn thì iOS Safari tự phóng to trang khi chạm vào ô
        className="block min-h-10 w-full appearance-none rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
        placeholder="Tìm nhanh công việc…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} // chờ để kịp bấm chọn gợi ý
        onKeyDown={onKeyDown}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200"
        >
          {searching && hits.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Đang tìm…</li>}
          {!searching && hits.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">Không tìm thấy công việc nào.</li>}
          {hits.map((h, i) => (
            <li
              key={h.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm ${i === active ? 'bg-blue-50' : 'active:bg-gray-100'}`}
              onMouseDown={(e) => e.preventDefault()} // giữ focus để onBlur không đóng trước khi chọn
              onClick={() => go(h)}
            >
              <span className="line-clamp-1 flex-1">{h.title}</span>
              <StatusBadge status={h.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
