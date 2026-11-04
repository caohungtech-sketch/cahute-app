import UpdatePrompt from './components/UpdatePrompt'
import { isSupabaseConfigured } from './lib/supabase'

export default function App() {
  return (
    <div className="flex min-h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <header className="bg-blue-700 px-4 py-3 text-white">
        <h1 className="text-lg font-semibold">Cahute</h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-semibold">Xin chào! Chào mừng đến với Cahute 👋</p>
        <p className="text-sm text-gray-500">
          {isSupabaseConfigured ? 'Đã cấu hình kết nối Supabase.' : 'Chưa cấu hình Supabase (xem .env.example).'}
        </p>
      </main>

      <UpdatePrompt />
    </div>
  )
}
