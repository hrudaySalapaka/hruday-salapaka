import type { UserProfile } from '../types/user'

export const DESIGNATED_ADMIN_EMAIL = 'hruday.salapaka10@gmail.com'

export function isDesignatedAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === DESIGNATED_ADMIN_EMAIL
}

export function hasDesignatedAdminAccess(profile: Pick<UserProfile, 'email' | 'role'> | null | undefined): boolean {
  return profile?.role === 'Admin' && isDesignatedAdminEmail(profile.email)
}
