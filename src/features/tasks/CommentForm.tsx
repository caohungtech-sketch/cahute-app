import { useRef, useState, type FormEvent } from 'react'
import { btn } from '../../components/ui'
import { compressImage } from '../../lib/compressImage'
import { supabase } from '../../lib/supabase'

const MAX_IMAGES = 5

interface Props {
  taskId: string
  userId: string
  parentId?: string // có → đây là câu trả lời
  placeholder: string
  autoFocus?: boolean
  onSent: () => void
  onCancel?: () => void
}

export default function CommentForm({ taskId, userId, parentId, placeholder, autoFocus, onSent, onCancel }: Props) {
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  function pickFiles(list: FileList | null) {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, MAX_IMAGES))
    if (fileInput.current) fileInput.current.value = ''
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim() && !files.length) return
    setSending(true)
    setError(null)
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
        .insert({ task_id: taskId, author_id: userId, parent_id: parentId ?? null, body: body.trim() })
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
      onSent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi thất bại.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={parentId ? 'mt-2' : 'mb-4 rounded-xl bg-white p-3 ring-1 ring-gray-200'}>
      <textarea
        className={`block w-full resize-y rounded-lg border border-gray-300 p-3 text-base focus:border-blue-600 focus:outline-none ${parentId ? 'min-h-16' : 'min-h-24'}`}
        placeholder={placeholder}
        maxLength={4000}
        autoFocus={autoFocus}
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
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <label className={`${btn.secondary} cursor-pointer ${files.length >= MAX_IMAGES ? 'pointer-events-none opacity-50' : ''}`}>
          📷 Ảnh
          <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />
        </label>
        {onCancel && (
          <button type="button" className={btn.secondary} onClick={onCancel}>
            Huỷ
          </button>
        )}
        <button className={`${btn.primary} flex-1`} disabled={sending || (!body.trim() && !files.length)}>
          {sending ? 'Đang gửi…' : parentId ? 'Trả lời' : 'Gửi'}
        </button>
      </div>
    </form>
  )
}
