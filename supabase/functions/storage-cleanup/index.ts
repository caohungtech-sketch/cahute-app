// Edge Function: dọn ảnh mồ côi trong bucket `attachments` (xem docs/storage-cleanup.md).
// Gọi bởi pg_cron hằng đêm (migration 0016) kèm header x-cleanup-secret.
// Deploy: npx supabase functions deploy storage-cleanup --no-verify-jwt
//   (không dùng JWT; thay bằng mã bí mật CLEANUP_SECRET để chỉ cron gọi được)
// Secret của function:
//   CLEANUP_SECRET   bắt buộc, trùng với vault secret 'cleanup_secret'
//   CLEANUP_DRY_RUN  'false' để xoá thật; thiếu hoặc giá trị khác → chỉ đếm, không xoá
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY do Supabase tự cung cấp.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const BATCH = 100 // số file xoá mỗi lần gọi Storage API
const MAX_PER_RUN = 5000 // giới hạn mỗi đêm; còn thì đêm sau xoá tiếp

Deno.serve(async (req) => {
  const secret = Deno.env.get('CLEANUP_SECRET')
  if (!secret || req.headers.get('x-cleanup-secret') !== secret) {
    return new Response('Forbidden', { status: 403 })
  }

  const dryRun = Deno.env.get('CLEANUP_DRY_RUN') !== 'false'
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  let foundFiles = 0
  let foundBytes = 0
  let deleted = 0
  let error: string | null = null

  try {
    if (dryRun) {
      // Chỉ đếm (tối đa MAX_PER_RUN file)
      const { data, error: e } = await supabase.rpc('find_orphan_attachments', { p_limit: MAX_PER_RUN })
      if (e) throw e
      const rows = (data ?? []) as { name: string; size_bytes: number }[]
      foundFiles = rows.length
      foundBytes = rows.reduce((s, r) => s + Number(r.size_bytes), 0)
    } else {
      // Xoá từng đợt; mỗi vòng hỏi lại danh sách (file đã xoá không còn trong storage.objects)
      while (deleted < MAX_PER_RUN) {
        const { data, error: e } = await supabase.rpc('find_orphan_attachments', { p_limit: BATCH })
        if (e) throw e
        const rows = (data ?? []) as { name: string; size_bytes: number }[]
        if (rows.length === 0) break
        foundFiles += rows.length
        foundBytes += rows.reduce((s, r) => s + Number(r.size_bytes), 0)
        const { data: removed, error: re } = await supabase.storage.from('attachments').remove(rows.map((r) => r.name))
        if (re) throw re
        deleted += removed?.length ?? 0
        if ((removed?.length ?? 0) === 0) break // tránh lặp vô hạn nếu không xoá được file nào
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  await supabase.from('storage_cleanup_runs').insert({
    dry_run: dryRun,
    found_files: foundFiles,
    found_bytes: foundBytes,
    deleted,
    error,
  })

  const result = { dryRun, foundFiles, foundBytes, deleted, error }
  console.log(JSON.stringify(result))
  return Response.json(result, { status: error ? 500 : 200 })
})
