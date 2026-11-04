import { useCallback, useEffect, useRef, useState } from 'react'
import { btn, ErrorBox } from '../../components/ui'
import { displayName } from '../../lib/profiles'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/time'
import type { Profile, TaskComment } from '../../lib/types'
import CommentForm from './CommentForm'

const PAGE_SIZE = 20
const SELECT = 'id, task_id, author_id, parent_id, body, created_at, task_attachments(id, storage_path, width, height)'

interface Props {
  taskId: string
  userId: string
  profilesById: Map<string, Profile>
}

function sortDesc(list: TaskComment[]) {
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export default function Comments({ taskId, userId, profilesById }: Props) {
  const [roots, setRoots] = useState<TaskComment[]>([]) // bình luận gốc, mới nhất trước
  const [replies, setReplies] = useState<Record<string, TaskComment[]>>({}) // theo bình luận gốc, cũ trước
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const rootsRef = useRef<TaskComment[]>([])
  rootsRef.current = roots

  const signUrls = useCallback(async (list: TaskComment[]) => {
    const paths = list.flatMap((c) => c.task_attachments.map((a) => a.storage_path))
    if (!paths.length) return
    const { data } = await supabase.storage.from('attachments').createSignedUrls(paths, 3600)
    if (!data) return
    const signed: Record<string, string> = {}
    for (const d of data) if (d.path && d.signedUrl) signed[d.path] = d.signedUrl
    setUrls((prev) => ({ ...prev, ...signed }))
  }, [])

  const loadReplies = useCallback(
    async (rootIds: string[]) => {
      if (!rootIds.length) return
      const { data, error } = await supabase
        .from('task_comments')
        .select(SELECT)
        .in('parent_id', rootIds)
        .order('created_at', { ascending: true })
      if (error) return setError('Không tải được câu trả lời.')
      const grouped: Record<string, TaskComment[]> = Object.fromEntries(rootIds.map((id) => [id, []]))
      for (const c of data as TaskComment[]) grouped[c.parent_id!].push(c)
      setReplies((prev) => ({ ...prev, ...grouped }))
      signUrls(data as TaskComment[])
    },
    [signUrls],
  )

  const mergeRoots = useCallback((incoming: TaskComment[]) => {
    setRoots((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]))
      incoming.forEach((c) => map.set(c.id, c))
      return sortDesc([...map.values()])
    })
  }, [])

  // Tải trang bình luận gốc mới nhất + toàn bộ câu trả lời của các bình luận đang hiển thị.
  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('task_comments')
      .select(SELECT)
      .eq('task_id', taskId)
      .is('parent_id', null)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (error) return setError('Không tải được bình luận.')
    setError(null)
    const latest = data as TaskComment[]
    mergeRoots(latest)
    setHasMore((prev) => prev || latest.length === PAGE_SIZE)
    signUrls(latest)
    const ids = new Set([...rootsRef.current.map((c) => c.id), ...latest.map((c) => c.id)])
    await loadReplies([...ids])
  }, [taskId, mergeRoots, signUrls, loadReplies])

  async function loadOlder() {
    const oldest = roots[roots.length - 1]
    const { data, error } = await supabase
      .from('task_comments')
      .select(SELECT)
      .eq('task_id', taskId)
      .is('parent_id', null)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (error) return setError('Không tải thêm được.')
    const older = data as TaskComment[]
    mergeRoots(older)
    setHasMore(older.length === PAGE_SIZE)
    signUrls(older)
    await loadReplies(older.map((c) => c.id))
  }

  useEffect(() => {
    refresh()
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, 300)
    }
    const channel = supabase
      .channel(`comments-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_attachments', filter: `task_id=eq.${taskId}` }, schedule)
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [taskId, refresh])

  function renderComment(c: TaskComment, isReply: boolean) {
    return (
      <div className={isReply ? 'border-l-2 border-blue-200 pl-3' : ''}>
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-gray-800">{displayName(profilesById.get(c.author_id ?? ''))}</span> ·{' '}
          {formatDateTime(c.created_at)}
        </p>
        {c.body && <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>}
        {c.task_attachments.length > 0 && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {c.task_attachments.map((a) => (
              <a
                key={a.id}
                href={urls[a.storage_path]}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg bg-gray-100"
              >
                {urls[a.storage_path] && (
                  <img src={urls[a.storage_path]} alt="Ảnh báo cáo" loading="lazy" className="h-full w-full object-cover" />
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold">Bình luận</h2>

      <CommentForm taskId={taskId} userId={userId} placeholder="Viết bình luận…" onSent={refresh} />

      {error && <ErrorBox message={error} onRetry={refresh} />}

      <ul className="space-y-3">
        {roots.map((c) => {
          const list = replies[c.id] ?? []
          return (
            <li key={c.id} className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
              {renderComment(c, false)}

              {list.length > 0 && (
                <ul className="mt-3 space-y-3">
                  {list.map((r) => (
                    <li key={r.id}>{renderComment(r, true)}</li>
                  ))}
                </ul>
              )}

              {replyTo === c.id ? (
                <CommentForm
                  taskId={taskId}
                  userId={userId}
                  parentId={c.id}
                  placeholder="Viết câu trả lời…"
                  autoFocus
                  onSent={() => {
                    setReplyTo(null)
                    refresh()
                  }}
                  onCancel={() => setReplyTo(null)}
                />
              ) : (
                <button className="mt-1 min-h-12 text-sm font-medium text-blue-700" onClick={() => setReplyTo(c.id)}>
                  ↩ Trả lời{list.length > 0 && ` (${list.length})`}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {roots.length === 0 && !error && <p className="py-6 text-center text-sm text-gray-500">Chưa có bình luận nào.</p>}
      {hasMore && (
        <button className={`${btn.secondary} mt-3 w-full`} onClick={loadOlder}>
          Xem bình luận cũ hơn
        </button>
      )}
    </section>
  )
}
