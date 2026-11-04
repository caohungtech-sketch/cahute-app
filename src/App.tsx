import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Layout from './components/Layout'
import { btn, FullScreenMessage, Skeleton } from './components/ui'
import UpdatePrompt from './components/UpdatePrompt'
import { isSupabaseConfigured } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import TasksPage from './pages/TasksPage'

// Tách code theo trang: chỉ tải khi mở.
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage'))
const TaskFormPage = lazy(() => import('./pages/TaskFormPage'))
const TeamPage = lazy(() => import('./pages/TeamPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))

function AppRoutes() {
  const { session, profile, loading, reload, signOut } = useAuth()

  if (loading)
    return (
      <FullScreenMessage>
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-700" aria-label="Đang tải" />
      </FullScreenMessage>
    )

  if (!session) return <LoginPage />

  if (!profile)
    return (
      <FullScreenMessage>
        <p>Không tải được hồ sơ người dùng. Kiểm tra kết nối mạng.</p>
        <div className="flex gap-2">
          <button className={btn.primary} onClick={reload}>
            Thử lại
          </button>
          <button className={btn.secondary} onClick={signOut}>
            Đăng xuất
          </button>
        </div>
      </FullScreenMessage>
    )

  return (
    <Suspense fallback={<div className="p-4"><Skeleton rows={2} /></div>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<TasksPage />} />
          <Route path="tasks/new" element={<TaskFormPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  if (!isSupabaseConfigured)
    return (
      <FullScreenMessage>
        <p className="text-lg font-semibold">Chưa cấu hình Supabase</p>
        <p className="text-sm text-gray-500">Khai báo VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY (xem .env.example).</p>
      </FullScreenMessage>
    )

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
      <UpdatePrompt />
    </BrowserRouter>
  )
}
