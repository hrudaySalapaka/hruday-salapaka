import { requireSupabase } from '../lib/supabase'
import type { ProfileInput, PublicUserRole, UserProfile } from '../types/user'
import { USER_ROLES } from '../types/user'

function getAvatarUrl(path: string | null): string | null {
  if (!path) return null
  // Profile photos are public assets; uploads and changes remain owner-scoped
  // by storage.objects RLS. A stable URL avoids signed-URL lookup failures.
  return requireSupabase().storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export function isProfileComplete(profile: UserProfile | null): boolean {
  return Boolean(profile?.profile_complete && profile.role)
}

export const profileService = {
  async getProfile(userId: string): Promise<UserProfile | null> {
    const client = requireSupabase()
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError) throw authError
    const avatarUrl = getAvatarUrl(data.avatar_path)
    return { ...data, email: user?.email ?? '', avatar_url: avatarUrl } as UserProfile
  },

  async saveRole(userId: string, role: PublicUserRole): Promise<void> {
    if (!USER_ROLES.includes(role)) throw new Error('Select a valid account role.')
    const client = requireSupabase()
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError) throw userError
    if (!user || user.id !== userId) throw new Error('Your session expired. Sign in again to save your role.')
    const { error } = await client.rpc('save_user_role', { selected_role: role })
    if (error) throw error
  },

  async saveProfile(userId: string, input: ProfileInput): Promise<UserProfile> {
    if (!input.full_name.trim()) throw new Error('Enter your full name.')
    const client = requireSupabase()
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError) throw userError
    if (!user || user.id !== userId) throw new Error('Your session expired. Sign in again to save your profile.')
    const profileComplete = Boolean(
      input.full_name.trim() && input.state?.trim() && input.district?.trim() &&
      input.village?.trim() && input.pin_code?.trim() && input.address?.trim(),
    )
    const { data, error } = await client
      .from('profiles')
      .upsert({
        id: user.id,
        ...input,
        full_name: input.full_name.trim(),
        profile_complete: profileComplete,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('*')
      .single()
    if (error) throw error
    const avatarUrl = getAvatarUrl(data.avatar_path)
    return { ...data, email: user?.email ?? '', avatar_url: avatarUrl } as UserProfile
  },

  async updateProfile(userId: string, input: ProfileInput, verifiedAvatarUrl?: string): Promise<UserProfile> {
    if (!input.full_name.trim()) throw new Error('Enter your full name.')
    const client = requireSupabase()
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError) throw userError
    if (!user || user.id !== userId) throw new Error('Your session expired. Sign in again to save your profile.')

    const { data, error } = await client
      .from('profiles')
      .update({ ...input, full_name: input.full_name.trim(), profile_complete: true, updated_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('*')
      .single()
    if (error) throw error
    const avatarUrl = verifiedAvatarUrl ?? getAvatarUrl(data.avatar_path)
    return { ...data, email: user.email ?? '', avatar_url: avatarUrl } as UserProfile
  },

  async uploadAvatar(userId: string, file: File): Promise<{ path: string; url: string }> {
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file for your profile photo.')
    if (file.size > 5 * 1024 * 1024) throw new Error('Profile photos must be 5 MB or smaller.')
    const client = requireSupabase()
    const { data: { user }, error: userError } = await client.auth.getUser()
    if (userError) throw userError
    if (!user || user.id !== userId) throw new Error('Your session expired. Sign in again to upload a profile photo.')
    const extensionByType: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    const extension = extensionByType[file.type]
    if (!extension) throw new Error('Choose a JPG, PNG or WebP image for your profile photo.')
    const path = `${user.id}/avatar-${crypto.randomUUID()}.${extension}`
    const { data, error } = await client.storage.from('avatars').upload(path, file, { upsert: false, contentType: file.type })
    if (error) throw error
    // Use Storage's canonical path and stable public URL. Owner-only RLS still
    // controls who can upload or replace an avatar.
    const uploadedPath = data.path
    const url = getAvatarUrl(uploadedPath)
    if (!url) throw new Error('Storage did not return a profile photo URL.')
    return { path: uploadedPath, url }
  },
}
