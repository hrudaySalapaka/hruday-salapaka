import { Navigate, Outlet } from 'react-router-dom'
import type { AppContextValue, UserProfile, UserRole } from '../types/user'

interface ProtectedRouteProps {
  isLoading: boolean
  userId: string | null
  profile: UserProfile | null
  allowedRoles?: UserRole[]
  stage?: 'role' | 'profile' | 'complete'
  context?: AppContextValue
}

export default function ProtectedRoute({ isLoading, userId, profile, allowedRoles, stage = 'complete', context }: ProtectedRouteProps) {
  if (isLoading) return <div className="full-screen-state" role="status"><span className="spinner" />Loading your account…</div>
  if (!userId) return <Navigate to="/auth" replace />
  if (profile?.role === 'Admin' && stage !== 'complete') return <Navigate to="/home" replace />
  if (stage === 'role') {
    if (profile?.profile_complete) return <Navigate to="/home" replace />
  } else if (stage === 'profile') {
    if (!profile?.role) return <Navigate to="/select-role" replace />
  } else {
    if (!profile?.role) return <Navigate to="/select-role" replace />
    if (!profile.profile_complete && profile.role !== 'Admin') return <Navigate to="/profile-setup" replace />
  }
  if (allowedRoles && profile?.role && !allowedRoles.includes(profile.role)) return <Navigate to="/home" replace />
  return <Outlet context={context} />
}
