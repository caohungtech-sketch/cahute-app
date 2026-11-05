import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthProvider'

function NavItem({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex min-h-14 flex-1 flex-col items-center justify-center text-xs ${isActive ? 'font-semibold text-blue-700' : 'text-gray-500'}`
      }
    >
      <span className="text-xl leading-none" aria-hidden>
        {icon}
      </span>
      {label}
    </NavLink>
  )
}

export default function Layout() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md">
          <NavItem to="/tasks" label="Công việc" icon="📋" />
          {isManager && <NavItem to="/team" label="Nhóm" icon="👥" />}
          <NavItem to="/account" label="Tài khoản" icon="👤" />
        </div>
      </nav>
    </div>
  )
}
