import { KonstaProvider, Tabbar, TabbarLink } from 'konsta/react'
import { FolderKanban, ListChecks, UserRound } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthProvider'

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

const TABS: { to: string; label: string; icon: Icon }[] = [
  { to: '/tasks', label: 'Công việc', icon: ListChecks },
  { to: '/account', label: 'Tài khoản', icon: UserRound },
]

// Màu tab đang chọn theo màu nhận diện (indigo), tab còn lại xám.
const TAB_COLORS = { textIos: 'text-gray-500', textActiveIos: 'text-indigo-700 dark:text-indigo-300' }

// Giao diện nhân viên (điện thoại): Konsta UI kiểu iOS cho mọi máy.
export default function Layout() {
  const { pathname } = useLocation()
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const tabs = isManager ? [TABS[0], { to: '/projects', label: 'Dự án', icon: FolderKanban }, TABS[1]] : TABS

  return (
    <KonstaProvider theme="ios" dark>
      <div className="flex min-h-dvh flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
          <Outlet />
        </main>

        <Tabbar labels icons className="fixed bottom-0 left-0 z-40" aria-label="Điều hướng chính">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(`${to}/`)
            return (
              <TabbarLink
                key={to}
                component={Link}
                linkProps={{ to, 'aria-current': active ? 'page' : undefined }}
                active={active}
                colors={TAB_COLORS}
                icon={<Icon className="h-6 w-6" aria-hidden />}
                label={label}
              />
            )
          })}
        </Tabbar>
      </div>
    </KonstaProvider>
  )
}
