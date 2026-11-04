import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { btn, ErrorBox } from '../../components/ui'
import { compressImage } from '../../lib/compressImage'
import { displayName } from '../../lib/profiles'
import { supabase } from '../../lib/supabase'
import { formatDateTime } from '../../lib/time'
import type { Profile, TaskComment } from '../../lib/types'

const PAGE_SIZE = 30
const MAX_IMAGES = 5
const SELECT = 'id, task_id, author_id, body, created_at, task_attachments(id, storage_path, width, height)'

interface Props {
  taskId: string
  userId: string
  profilesById: Map<string, Profile>
}

export default function Comments({ taskId, userId, profilesById }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([]) // mới nhất trước
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const signUrls = useCallback(async (list: TaskComment[]) => {
    const paths = list.flatMap((c) => c.task_attachments.map((a) => a.storage_path))
    if (!paths.length) return
    const { data } = await supabase.storage.from('attachments').createSignedUrls(paths, 3600)
    if (!data) return
    const signed: Record<string, string> = {}
    for (const d of data) if (d.path && d.signedUrl) signed[d.path] = d.signedUrl
    setUrls((prev) => ({ ...prev, ...signed }))
  }, [])

  const merge = useCallback((incoming: TaskComment[]) => {
    setComments((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]))
      incoming.forEach((c) => map.set(c.id, c))
      return [...map.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
    })
  }, [])

  const loadLatest = useCallback(async () => {
    const { data, error } = await supabase
      .from('task_comments')
      .select(SELECT)
      .eq('task_id', taskId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (error) return setError('Không tải được báo cáo.')
    setError(null)
    merge(data as TaskComment[])
    setHasMore((prev) => prev || data.length === PAGE_SIZE)
    signUrls(data as TaskComment[])
  }, [taskId, merge, signUrls])

  async function loadOlder() {
    const oldest = comments[comments.length - 1]
    const { data, error } = await supabase
      .from('task_comments')
      .select(SELECT)
      .eq('task_id', taskId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (error) return setError('Không tải thêm được.')
    merge(data as TaskComment[])
    setHasMore(data.length === PAGE_SIZE)
    signUrls(data as TaskComment[])
  }

  useEffect(() => {
    loadLatest()
    let timer: ReturnType<typeof setTimeout> | undefined
    const channel = supabase
      .channel(`comments-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` }, () => {
        clearTimeout(timer)
        timer = setTimeout(loadLatest, 300)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_attachments', filter: `task_id=eq.${taskId}` }, () => {
        clearTimeout(timer)
        timer = setTimeout(loadLatest, 300)
      })
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [taskId, loadLatest])

  function pickFiles(list: FileList | null) {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_IMAGES))
    if (fileInput.current) fileInput.current.value = ''
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() && !files.length) return
    setSending(true)
    setSendError(null)
    try {
      // 1. Nén + upload ảnh trước; lỗi thì chưa tạo bình luận.
      const uploaded = []
      for (const f of files) {
        const img = await compressImage(f)
        const path = `tasks/${taskId}/${crypto.randomUUID()}.${img.ext}`
        const { error } = await supabase.storage.from('attachments').upload(path, img.blob, { contentType: img.mimeType })
        if (error) throw new Error(`Tải ảnh lên thất bại: ${error.message}`)
        uploaded.push({ path, img })
      }

      // 2. Tạo bình luận + gắn ảnh
      const { data: c, error: cErr } = await supabase
        .from('task_comments')
        .insert({ task_id: taskId, author_id: userId, body: body.trim() })
        .select('id')
        .single()
      if (cErr) throw new Error(cErr.message)

      if (uploaded.length) {
        const { error: aErr } = await supabase.from('task_attachments').insert(
          uploaded.map(({ path, img }) => ({
            task_id: taskId,
            comment_id: c.id,
            uploaded_by: userId,
            storage_path: path,
            mime_type: img.mimeType,
            width: img.width,
            height: img.height,
            size_bytes: img.blob.size,
          })),
        )
        if (aErr) throw new Error(aErr.message)
      }

      setBody('')
      setFiles([])
      await loadLatest()
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Gửi báo cáo thất bại.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-lg font-semibold">Báo cáo & bình luận</h2>

      <form onSubmit={onSubmit} className="mb-4 rounded-xl bg-white p-3 ring-1 ring-gray-200">
        <textarea
          className="block min-h-24 w-full resize-y rounded-lg border border-gray-300 p-3 text-base focus:border-blue-600 focus:outline-none"
          placeholder="Báo cáo kết quả, ghi chú…"
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {files.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-1 rounded-lg bg-gray-100 py-1 pl-2 text-xs">
                <span className="max-w-32 truncate">{f.name}</span>
                <button
                  type="button"
                  className="h-8 w-8 text-gray-500"
                  aria-label="Bỏ ảnh"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {sendError && <p className="mt-2 text-sm text-red-700">{sendError}</p>}
        <div className="mt-2 flex gap-2">
          <label className={`${btn.secondary} cursor-pointer ${files.length >= MAX_IMAGES ? 'pointer-events-none opacity-50' : ''}`}>
            📷 Ảnh
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => pickFiles(e.target.files)}
            />
          </label>
          <button className={`${btn.primary} flex-1`} disabled={sending || (!body.trim() && !files.length)}>
            {sending ? 'Đang gửi…' : 'Gửi'}
          </button>
        </div>
      </form>

      {error && <ErrorBox message={error} onRetry={loadLatest} />}

      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-xl bg-white p-3 ring-1 ring-gray-200">
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
          </li>
        ))}
      </ul>
      {comments.length === 0 && !error && <p className="py-6 text-center text-sm text-gray-500">Chưa có báo cáo nào.</p>}
      {hasMore && (
        <button className={`${btn.secondary} mt-3 w-full`} onClick={loadOlder}>
          Xem báo cáo cũ hơn
        </button>
      )}
    </section>
  )
}
