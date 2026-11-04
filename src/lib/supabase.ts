import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

// App.tsx chặn toàn bộ giao diện khi chưa cấu hình, nên các nơi khác dùng thẳng `supabase`.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, anonKey!)
  : (null as unknown as SupabaseClient)
