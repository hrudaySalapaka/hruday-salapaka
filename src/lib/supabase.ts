import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let rememberSession = true
let activeSessionStorage: Storage | null = null

const sessionStorageAdapter = {
  getItem: (key: string) => {
    const preferred = rememberSession ? localStorage : sessionStorage
    const fallback = rememberSession ? sessionStorage : localStorage
    const preferredValue = preferred.getItem(key)
    if (preferredValue !== null) {
      activeSessionStorage = preferred
      return preferredValue
    }
    const fallbackValue = fallback.getItem(key)
    if (fallbackValue !== null) activeSessionStorage = fallback
    return fallbackValue
  },
  setItem: (key: string, value: string) => (activeSessionStorage ?? (rememberSession ? localStorage : sessionStorage)).setItem(key, value),
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
    activeSessionStorage = null
  },
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: sessionStorageAdapter },
    })
  : null

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }
  return supabase
}

export function setRememberSession(value: boolean) {
  rememberSession = value
  activeSessionStorage = null
}
