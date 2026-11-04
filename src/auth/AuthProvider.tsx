import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearProfilesCache } from '../lib/profiles'
import type { Profile, Team } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  managedTeams: Team[] // các nhóm mà người dùng là quản lý
  loading: boolean
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [managedTeams, setManagedTeams] = useState<Team[]>([])
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
      setManagedTeams([])
      return
    }
    const [p, t] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role, team_id, avatar_path').eq('id', userId).single(),
      supabase.from('teams').select('id, name, manager_id').eq('manager_id', userId).order('name'),
    ])
    setProfile((p.data as Profile) ?? null)
    setManagedTeams((t.data as Team[]) ?? [])
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
    <AuthContext.Provider value={{ session, profile, managedTeams, loading, reload, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider')
  return ctx
}
