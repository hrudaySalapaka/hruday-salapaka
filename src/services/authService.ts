import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { requireSupabase, setRememberSession } from '../lib/supabase'

export const authService = {
  async signUp(fullName: string, email: string, password: string) {
    const client = requireSupabase()
    const { data, error } = await client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })
    if (error) throw error
    if (!data.user) throw new Error('Account could not be created.')
    return { user: data.user, session: data.session }
  },

  async signIn(email: string, password: string, remember = true) {
    setRememberSession(remember)
    const { data, error } = await requireSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw error
    if (!data.user) throw new Error('Sign in did not return a user.')
    return data.user
  },

  async syncAdminRole() {
    const { data, error } = await requireSupabase().functions.invoke('provision-admin-role', { method: 'POST' })
    if (error) throw error
    return data as { role: string | null; verified: boolean; admin?: boolean }
  },

  async signOut() {
    const { error } = await requireSupabase().auth.signOut()
    if (error) throw error
  },

  async resetPassword(email: string) {
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase())
    if (error) throw error
  },

  async getSession(): Promise<Session | null> {
    const { data, error } = await requireSupabase().auth.getSession()
    if (error) throw error
    return data.session
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    const { data } = requireSupabase().auth.onAuthStateChange(callback)
    return () => data.subscription.unsubscribe()
  },
}
