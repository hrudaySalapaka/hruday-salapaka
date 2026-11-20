export const USER_ROLES = [
  'Farmer',
  'Equipment Owner',
  'Customer',
  'Delivery Partner',
  'Ride Booking Partner',
  'Market Seller',
  'Event Manager',
  'Food Seller',
] as const

export type PublicUserRole = (typeof USER_ROLES)[number]
/** Admin is provisioned by trusted operators and is intentionally not selectable during sign-up. */
export type UserRole = PublicUserRole | 'Admin'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: UserRole | null
  phone: string | null
  avatar_path: string | null
  avatar_url: string | null
  state: string | null
  district: string | null
  village: string | null
  pin_code: string | null
  address: string | null
  location: { lat: number; lng: number } | null
  role_info: Record<string, string>
  profile_complete: boolean
  created_at: string
  updated_at: string
}

export type ProfileInput = Pick<
  UserProfile,
  'full_name' | 'phone' | 'avatar_path' | 'state' | 'district' | 'village' | 'pin_code' | 'address' | 'location' | 'role_info'
>

export interface AuthResult {
  userId: string
  email: string
}

export interface AppContextValue {
  userId: string
  profile: UserProfile | null
  refreshProfile: () => Promise<void>
  updateProfile: (profile: UserProfile) => void
}
