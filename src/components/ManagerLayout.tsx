import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import {
  Building2,
  CalendarClock,
  ChevronDown,
  CircleHelp,
  Clock,
  Contact,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  Wrench,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import QuickSearch from '../features/tasks/QuickSearch'
import { useTheme } from '../lib/theme'
import { formatClock } from '../lib/time'

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

const MENU: { to: string; label: string; icon: Icon }[] = [
  { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/messages', label: 'Tin nhắn', icon: MessageSquare },
  { to: '/projects', label: 'Dự án', icon: FolderKanban },
  { to: '/tasks', label: 'Tác vụ', icon: ListChecks },
  { to: '/appointments', label: 'Lịch hẹn', icon: CalendarClock },
  { to: '/staff', label: 'Nhân viên', icon: Contact },
  { to: '/customers', label: 'Khách hàng', icon: Building2 },
  { to: '/services', label: 'Dịch vụ', icon: Wrench },
  { to: '/account', label: 'Cài đặt', icon: Settings },
]

const QUICK_TABS = [
  { to: '/tasks', label: 'Tác vụ' },
  { to: '/projects', label: 'Dự án' },
]
const MORE_TABS = [
  { to: '/appointments', label: 'Lịch hẹn' },
  { to: '/customers', label: 'Khách hàng' },
  { to: '/services', label: 'Dịch vụ' },
]

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('sidebar.collapsed') === '1'
  } catch {
    return false
  }
}

function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-indigo-950 text-indigo-100">
      <div className={`flex h-16 shrink-0 items-center gap-3 ${collapsed ? 'justify-center px-2' : 'pl-5 pr-3'}`}>
        {collapsed && onToggle ? (
          // Đã thu gọn: logo là nút mở rộng (rê chuột → hiện biểu tượng mở rộng)
          <button
            onClick={onToggle}
            className="group grid h-11 w-11 shrink-0 place-items-center rounded-xl"
            aria-label="Mở rộng thanh bên"
            title="Mở rộng"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-lg font-bold text-white group-hover:hidden group-focus-visible:hidden">
              C
            </span>
            <span className="hidden h-11 w-11 place-items-center rounded-xl text-indigo-200 group-hover:grid group-hover:bg-white/10 group-hover:text-white group-focus-visible:grid">
              <PanelLeftOpen className="h-5 w-5" aria-hidden />
            </span>
          </button>
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-violet-600 text-lg font-bold text-white">
            C
          </span>
        )}
        {!collapsed && (
          <span className="flex-1 truncate text-lg font-bold tracking-tight text-white">
            Cahute <span className="font-medium text-indigo-300">CRM</span>
          </span>
        )}
        {!collapsed && onToggle && (
          <button
            onClick={onToggle}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-indigo-300 hover:bg-white/10 hover:text-white"
            aria-label="Thu gọn thanh bên"
            title="Thu gọn"
          >
            <PanelLeftClose className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Điều hướng chính">
        {MENU.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${isActive ? 'bg-white/15 text-white shadow-sm' : 'text-indigo-200 hover:bg-white/10 hover:text-white'}`
            }
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="hidden items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm font-semibold tabular-nums text-gray-700 sm:inline-flex">
      <Clock className="h-4 w-4 text-gray-500" aria-hidden />
      {formatClock(now)}
    </span>
  )
}

function MoreMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current?.contains(e.target as Node) || setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Thêm <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-44 rounded-xl bg-white py-1 shadow-lg ring-1 ring-gray-200">
          {MORE_TABS.map((t) => (
            <Link key={t.to} to={t.to} onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100">
              {t.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// Khung giao diện cho quản lý: sidebar trái (thu gọn được) + thanh trên + vùng nội dung.
export default function ManagerLayout() {
  const { profile } = useAuth()
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    setSearchOpen(false)
  }, [location.pathname])

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem('sidebar.collapsed', c ? '0' : '1')
      } catch {
        /* bỏ qua */
      }
      return !c
    })
  }

  const name = profile?.full_name || 'Quản lý'
  const initials = name
    .split(/\s+/)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar máy tính */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-200 md:block ${collapsed ? 'w-[76px]' : 'w-64'}`}
      >
        <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>

      {/* Sidebar điện thoại: ngăn kéo */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] pt-[env(safe-area-inset-top)] shadow-xl">
            <button
              className="absolute right-2 top-[calc(0.75rem+env(safe-area-inset-top))] z-10 grid h-10 w-10 place-items-center rounded-lg text-indigo-200 hover:bg-white/10"
              onClick={() => setDrawerOpen(false)}
              aria-label="Đóng menu"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            <Sidebar collapsed={false} onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white pt-[env(safe-area-inset-top)]">
          <div className="flex h-16 items-center gap-2 px-3 md:px-6">
            <button
              className="grid h-11 w-11 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 md:hidden"
              onClick={() => setDrawerOpen(true)}
              aria-label="Mở menu"
            >
              <Menu className="h-6 w-6" aria-hidden />
            </button>
            <span className="text-base font-bold md:hidden">Cahute</span>

            <nav className="hidden items-center gap-1 md:flex" aria-label="Truy cập nhanh">
              {QUICK_TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={t.to}
                  className={({ isActive }) =>
                    `inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium ${
                      isActive ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  {t.label}
                </NavLink>
              ))}
              <MoreMenu />
            </nav>

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <QuickSearch projectId={null} className="hidden w-64 lg:block xl:w-80" />
              <button
                className="grid h-11 w-11 place-items-center rounded-lg text-gray-600 hover:bg-gray-100 lg:hidden"
                onClick={() => setSearchOpen((o) => !o)}
                aria-label="Tìm kiếm"
                aria-expanded={searchOpen}
              >
                <Search className="h-5 w-5" aria-hidden />
              </button>
              <Link
                to="/help"
                className="grid h-11 w-11 place-items-center rounded-lg text-gray-600 hover:bg-gray-100"
                aria-label="Trợ giúp"
                title="Trợ giúp"
              >
                <CircleHelp className="h-5 w-5" aria-hidden />
              </Link>
              <LiveClock />
              <button
                className="grid h-11 w-11 place-items-center rounded-lg text-gray-600 hover:bg-gray-100"
                onClick={toggle}
                aria-label={theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối'}
                title={theme === 'dark' ? 'Chế độ sáng' : 'Chế độ tối'}
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
              </button>
              <Link to="/account" className="flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-1 hover:bg-gray-100 lg:pr-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-semibold text-white">
                  {initials}
                </span>
                <span className="hidden max-w-40 truncate text-sm font-medium lg:block">{name}</span>
              </Link>
            </div>
          </div>
          {searchOpen && (
            <div className="px-3 pb-3 lg:hidden">
              <QuickSearch projectId={null} className="" />
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pt-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
