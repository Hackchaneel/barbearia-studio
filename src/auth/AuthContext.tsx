import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type StaffRole = 'owner' | 'manager' | 'barber'
export type ShopMembership = { id: string; barbershop_id: string; role: StaffRole; display_name: string }
type AuthContextValue = {
  session: Session | null
  ready: boolean
  memberships: ShopMembership[]
  membershipsLoading: boolean
  membershipsError: string | null
  refreshMemberships: () => Promise<void>
  signOut: () => Promise<void>
}
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [memberships, setMemberships] = useState<ShopMembership[]>([])
  const [membershipsLoading, setMembershipsLoading] = useState(false)
  const [membershipsError, setMembershipsError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) { setReady(true); return }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  const refreshMemberships = async () => {
    if (!supabase || !session?.user.id) { setMemberships([]); return }
    setMembershipsLoading(true)
    setMembershipsError(null)
    const { data, error } = await supabase.rpc('get_my_barbershop_memberships')
    if (error) {
      setMembershipsError('Não foi possível consultar seu acesso. Confira se as migrações do Supabase foram aplicadas.')
      setMemberships([])
    } else {
      setMemberships((data ?? []) as ShopMembership[])
    }
    setMembershipsLoading(false)
  }

  useEffect(() => {
    setMemberships([])
    setMembershipsLoading(Boolean(session?.user.id))
    if (session?.user.id) void refreshMemberships()
    // refreshMemberships intentionally tracks only the authenticated user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id])

  const signOut = async () => { if (supabase) await supabase.auth.signOut() }
  const value = useMemo(() => ({ session, ready, memberships, membershipsLoading, membershipsError, refreshMemberships, signOut }), [session, ready, memberships, membershipsLoading, membershipsError])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return value
}


