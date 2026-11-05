import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearProfilesCache } from '../lib/profiles'
import type { Profile, Project } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  managedProjects: Project[] // các dự án mà người dùng là quản lý
  loading: boolean
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [managedProjects, setManagedProjects] = useState<Project[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null) // user id đã tải xong hồ sơ

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
    })
    // Không gọi supabase trực tiếp trong callback này (tránh khoá phiên) – chỉ set state.
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const reload = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setManagedProjects([])
      return
    }
    const [p, t] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, avatar_path').eq('id', userId).single(),
      // !inner: chỉ lấy dự án mà người dùng có trong project_managers
      supabase.from('projects').select('id, name, project_managers!inner(user_id)').eq('project_managers.user_id', userId).order('name'),
    ])
    setProfile((p.data as Profile) ?? null)
    setManagedProjects((t.data ?? []).map(({ id, name }) => ({ id, name })))
    setLoadedFor(userId)
  }, [userId])

  useEffect(() => {
    reload()
  }, [reload])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    clearProfilesCache()
  }, [])

  // Khi tải xong mà profile vẫn null (lỗi mạng…) App sẽ hiện nút "Thử lại".
  const loading = !sessionReady || (Boolean(userId) && loadedFor !== userId)

  return (
    <AuthContext.Provider value={{ session, profile, managedProjects, loading, reload, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider')
  return ctx
}
