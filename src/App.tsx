import { lazy, Suspense } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { btn, FullScreenMessage, Skeleton } from './components/ui'
import UpdatePrompt from './components/UpdatePrompt'
import { queryClient } from './lib/queryClient'
import { isSupabaseConfigured } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import TasksPage from './pages/TasksPage'

// Tách code theo trang: chỉ tải khi mở.
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage'))
const TaskFormPage = lazy(() => import('./pages/TaskFormPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))
const ManagerLayout = lazy(() => import('./components/ManagerLayout'))
const Layout = lazy(() => import('./components/Layout')) // giao diện nhân viên (Konsta UI): quản lý không phải tải
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'))

// Các mục menu của quản lý chưa xây dựng
const COMING_SOON: [string, string][] = [
  ['messages', 'Tin nhắn'],
  ['appointments', 'Lịch hẹn'],
  ['customers', 'Khách hàng'],
  ['services', 'Dịch vụ'],
  ['help', 'Trợ giúp'],
]

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

  const isManager = profile.role === 'manager'

  return (
    <Suspense fallback={<div className="p-4"><Skeleton rows={2} /></div>}>
      <Routes>
        {/* Quản lý: sidebar + thanh trên; nhân viên: thanh điều hướng dưới */}
        <Route element={isManager ? <ManagerLayout /> : <Layout />}>
          <Route index element={isManager ? <DashboardPage /> : <Navigate to="/tasks" replace />} />
          <Route path="tasks" element={<TasksPage />} />
          {isManager &&
            COMING_SOON.map(([path, title]) => <Route key={path} path={path} element={<ComingSoonPage title={title} />} />)}
          <Route path="tasks/new" element={<TaskFormPage />} />
          <Route path="tasks/:id" element={<TaskDetailPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="permissions" element={<Navigate to="/staff" replace />} />
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
        <UpdatePrompt />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
