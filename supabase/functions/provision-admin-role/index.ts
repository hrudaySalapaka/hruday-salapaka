import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return response({ error: 'POST is required.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const configuredAdminEmail = 'hruday.salapaka10@gmail.com'
  if (!url || !anonKey || !serviceKey) {
    return response({ error: 'Admin provisioning is not configured on the server.' }, 503)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'A signed-in user is required.' }, 401)

  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  const user = userData.user
  if (userError || !user) return response({ error: 'The session could not be verified.' }, 401)

  const serviceClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: settingError } = await serviceClient.from('admin_access_settings').upsert({ id: true, admin_email: configuredAdminEmail, updated_at: new Date().toISOString() }, { onConflict: 'id' })
  if (settingError) return response({ error: 'The Admin identity could not be synchronized.' }, 503)

  const verified = Boolean(user.email_confirmed_at)
  const matches = verified && user.email?.trim().toLowerCase() === configuredAdminEmail
  const { data: profile, error: profileError } = await serviceClient.from('profiles').select('id,role,full_name').eq('id', user.id).maybeSingle()
  if (profileError) return response({ error: 'The account role could not be checked.' }, 503)

  if (matches) {
    const saved = profile
      ? await serviceClient.from('profiles').update({ role: 'Admin', updated_at: new Date().toISOString() }).eq('id', user.id)
      : await serviceClient.from('profiles').insert({ id: user.id, full_name: String(user.user_metadata?.full_name ?? user.email ?? 'KHETIGO Admin'), role: 'Admin' })
    if (saved.error) return response({ error: 'Admin role assignment failed. Apply the latest database migrations.' }, 503)
    return response({ role: 'Admin', verified: true })
  }

  if (profile?.role === 'Admin') {
    const revoked = await serviceClient.from('profiles').update({ role: null, updated_at: new Date().toISOString() }).eq('id', user.id)
    if (revoked.error) return response({ error: 'Stale Admin access could not be revoked.' }, 503)
  }
  return response({ role: profile?.role === 'Admin' ? null : profile?.role ?? null, verified, admin: false })
})
