import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import Header from './components/Header'
import ProfileAvatar from './components/ProfileAvatar'
import BottomNav from './components/BottomNav'
import ProtectedRoute from './components/ProtectedRoute'
import GuestStart from './pages/GuestStart'
import AuthEntry from './pages/AuthEntry'
import Login, { PasswordRecovery } from './pages/Login'
import CreateAccount from './pages/CreateAccount'
import SelectRole from './pages/SelectRole'
import ProfileSetup from './pages/ProfileSetup'
import Home from './pages/Home'
import { authService } from './services/authService'
import { profileService } from './services/profileService'
import { isSupabaseConfigured } from './lib/supabase'
import type { AppContextValue, UserProfile, UserRole } from './types/user'
import { requireSupabase } from './lib/supabase'
import { hasDesignatedAdminAccess } from './lib/adminAccess'
import type { WorkspaceProps } from './features/WorkspacePage'
import FarmerDashboard from './features/farmer/Dashboard'
import CustomerDashboard from './features/customer/Dashboard'
import EquipmentOwnerDashboard from './features/equipment-owner/Dashboard'
import EquipmentManagementRoutes from './features/equipment-owner/equipment/EquipmentManagementRoutes'
import DeliveryPartnerDashboard from './features/delivery-partner/Dashboard'
import RideBookingDashboard from './features/ride-booking/Dashboard'
import MarketSellerDashboard from './features/market-seller/Dashboard'
import FarmerBottomNav from './features/farmer/layout/FarmerBottomNav'
import ExploreHome from './features/farmer/explore/ExploreHome'
import ExploreHeader from './features/farmer/explore/ExploreHeader'
import FarmerRoutes from './features/farmer/FarmerRoutes'
import FarmerProfile from './features/farmer/pages/Profile'
import FarmerNotifications from './features/farmer/pages/Notifications'
import RoleFeaturePage from './features/RoleFeaturePage'
import RentalPayments from './features/admin/RentalPayments'

interface RouteItem { path: string; title: string; table: string; roles: UserRole[]; description: string; initialCreating?: boolean }

const routeItems: RouteItem[] = [
  { path: '/farmer/farms', title: 'My farms', table: 'farms', roles: ['Farmer'], description: 'Keep your farm locations and land details together.' },
  { path: '/farmer/crops', title: 'My crops', table: 'crops', roles: ['Farmer'], description: 'Track crop varieties and planned harvests.' },
  { path: '/farmer/products', title: 'My products & sales', table: 'products', roles: ['Farmer'], description: 'List your harvest, manage stock and review sales.' },
  { path: '/farmer/equipment', title: 'Equipment rental', table: 'equipment', roles: ['Farmer'], description: 'Explore equipment listed by owners near you.' },
  { path: '/farmer/bookings', title: 'My equipment bookings', table: 'equipment_bookings', roles: ['Farmer'], description: 'Track equipment requests and confirmed bookings.' },
  { path: '/farmer/orders', title: 'Orders & bookings', table: 'orders', roles: ['Farmer'], description: 'Review orders and booking activity tied to your account.' },
  { path: '/farmer/earnings', title: 'Earnings', table: 'payments', roles: ['Farmer'], description: 'Your recorded payments and earnings.' },
  { path: '/equipment-owner/equipment', title: 'My equipment', table: 'equipment', roles: ['Equipment Owner'], description: 'Manage equipment you have listed.' },
  { path: '/equipment-owner/requests', title: 'Rental requests', table: 'equipment_bookings', roles: ['Equipment Owner'], description: 'Review equipment booking requests.' },
  { path: '/equipment-owner/used', title: 'Used equipment', table: 'equipment', roles: ['Equipment Owner'], description: 'Manage used machinery listings.' },
  { path: '/equipment-owner/earnings', title: 'Earnings', table: 'payments', roles: ['Equipment Owner'], description: 'Your recorded payments and earnings.' },
  { path: '/orders', title: 'My orders', table: 'orders', roles: ['Customer'], description: 'Review your order history and status.' },
  { path: '/cart', title: 'Shopping cart', table: 'cart_items', roles: ['Customer'], description: 'Your saved cart items.' },
  { path: '/checkout', title: 'Checkout', table: 'orders', roles: ['Customer'], description: 'Review your order before payment.' },
  { path: '/rides/history', title: 'My rides', table: 'rides', roles: ['Customer'], description: 'Review your past ride bookings.' },
  { path: '/delivery/jobs', title: 'Available delivery jobs', table: 'delivery_jobs', roles: ['Delivery Partner'], description: 'Jobs available to your delivery account.' },
  { path: '/delivery/history', title: 'My deliveries', table: 'delivery_jobs', roles: ['Delivery Partner'], description: 'Track deliveries assigned to you.' },
  { path: '/delivery/earnings', title: 'Earnings', table: 'payments', roles: ['Delivery Partner'], description: 'Your recorded payments and earnings.' },
  { path: '/ride-partner/requests', title: 'Ride requests', table: 'rides', roles: ['Ride Booking Partner'], description: 'Review ride requests for your account.' },
  { path: '/ride-partner/history', title: 'Ride history', table: 'rides', roles: ['Ride Booking Partner'], description: 'Review completed rides.' },
  { path: '/ride-partner/earnings', title: 'Earnings', table: 'payments', roles: ['Ride Booking Partner'], description: 'Your recorded payments and earnings.' },
  { path: '/seller/products', title: 'My products', table: 'products', roles: ['Market Seller'], description: 'Manage products listed by your account.' },
  { path: '/seller/add-product', title: 'Add product', table: 'products', roles: ['Market Seller'], description: 'Create a product listing for your store.', initialCreating: true },
  { path: '/seller/orders', title: 'Incoming orders', table: 'orders', roles: ['Market Seller'], description: 'Review customer orders for your products.' },
  { path: '/seller/earnings', title: 'Sales & earnings', table: 'payments', roles: ['Market Seller'], description: 'Your recorded sales and payments.' },
]

const dashboards: Record<UserRole, ComponentType<Omit<WorkspaceProps, 'roles'>>> = {
  Farmer: FarmerDashboard,
  Customer: CustomerDashboard,
  'Equipment Owner': EquipmentOwnerDashboard,
  'Delivery Partner': DeliveryPartnerDashboard,
  'Ride Booking Partner': RideBookingDashboard,
  'Market Seller': MarketSellerDashboard,
  'Event Manager': Home,
  'Food Seller': Home,
  Admin: Home,
}

interface AppLayoutProps { profile: UserProfile | null; onSignOut: () => void }
function AppLayout({ profile, onSignOut }: AppLayoutProps) {
  const context = useOutletContext<AppContextValue>()
  const location = useLocation()
  const marketplaceHome = profile?.role === 'Farmer' && ['/home', '/farmer/home', '/farmer/explore'].includes(location.pathname)
  if (!profile?.role) return <Navigate to="/select-role" replace />
  return <div className="app-shell">{profile.role === 'Farmer' ? <ExploreHeader profile={profile} onSignOut={onSignOut} /> : <Header user={profile} onSignOut={onSignOut} />}<div className="app-layout"><main className={`route-content${marketplaceHome ? ' farmer-route-content' : ''}`}><Outlet context={context} /></main></div>{profile.role === 'Farmer' ? <FarmerBottomNav /> : <BottomNav role={profile.role} />}</div>
}

function PlainPage({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return <section className={`plain-page${className ? ` ${className}` : ''}`}><h1>{title}</h1>{children}</section>
}

function authenticatedDestination(profile: UserProfile | null): string {
  if (!profile?.role) return '/select-role'
  if (profile.role === 'Admin') return hasDesignatedAdminAccess(profile) ? '/admin/rental-payments' : '/'
  if (profile.profile_complete) return '/home'
  return '/profile-setup'
}

function AuthPageRoute({ isLoading, userId, profile, children }: {
  isLoading: boolean
  userId: string | null
  profile: UserProfile | null
  children: ReactNode
}) {
  if (isLoading) return <div className="full-screen-state" role="status"><span className="spinner" />Loading your accountâ€¦</div>
  if (userId) return <Navigate to={authenticatedDestination(profile)} replace />
  return children
}

function SearchPage() {
  const params = new URLSearchParams(window.location.search)
  return <PlainPage title="Search KHETIGO"><p>Search for ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ{params.get('q') || ''}ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â. Product and equipment listings appear here when they are available in your account region.</p><Link className="button button-primary" to="/shop">Browse products</Link></PlainPage>
}

function AuxiliaryRoutes() {
  return <Routes><Route path="/terms" element={<PlainPage title="Terms of service"><p>Use KHETIGO responsibly and provide accurate account information. Terms will be published here before launch.</p></PlainPage>} /><Route path="/privacy" element={<PlainPage title="Privacy policy"><p>KHETIGO uses your account and profile information to provide the services you choose. The complete privacy policy will be published here before launch.</p></PlainPage>} /></Routes>
}

interface NotificationRow { id: string; title: string; body: string; read_at: string | null; created_at: string }
function NotificationsPage() {
  const { userId } = useOutletContext<AppContextValue>()
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void Promise.resolve(requireSupabase().from('notifications').select('id,title,body,read_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50))
        .then(({ data, error: resultError }) => { if (!active) return; if (resultError) setError(resultError.message); else setRows((data ?? []) as NotificationRow[]) })
        .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load notifications.') })
        .finally(() => { if (active) setLoading(false) })
    }, 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [userId])
  async function markRead(id: string) {
    const readAt = new Date().toISOString()
    const { error: updateError } = await requireSupabase().from('notifications').update({ read_at: readAt }).eq('id', id).eq('user_id', userId)
    if (updateError) setError(updateError.message)
    else setRows((current) => current.map((item) => item.id === id ? { ...item, read_at: readAt } : item))
  }
  return <PlainPage title="Notifications">{error && <div className="notice notice-error" role="alert">{error}</div>}{loading ? <div className="workspace-state"><span className="spinner" /> Loading notificationsÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦</div> : rows.length ? <div className="notification-list">{rows.map((item) => <article key={item.id} className={`notification-card${item.read_at ? '' : ' unread'}`}><span className="notification-dot" /><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString()}</small></div>{!item.read_at && <button className="button button-outline button-small" onClick={() => void markRead(item.id)}>Mark read</button>}</article>)}</div> : <div className="empty-state"><p>You donÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢t have notifications yet.</p></div>}</PlainPage>
}

function AppRoutes() {
  const navigate = useNavigate()
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState('')
  const profileRequest = useRef(0)

  const refreshProfile = useCallback(async () => {
    if (!userId) { setProfile(null); return }
    const requestId = ++profileRequest.current
    const result = await profileService.getProfile(userId)
    if (requestId === profileRequest.current) setProfile(result)
  }, [userId])

  const updateProfile = useCallback((nextProfile: UserProfile) => {
    if (nextProfile.id === userId) setProfile(nextProfile)
  }, [userId])

  const loadSession = useCallback(async (id: string | null) => {
    const requestId = ++profileRequest.current
    setUserId(id)
    if (!id) { setProfile(null); setLoading(false); return }
    setProfile(null)
    setAuthError('')
    setLoading(true)
    try {
      // This server function validates the JWT and email verification before
      // it can provision the single designated Admin identity. Its failure
      // never changes the Farmer/Owner login flow.
      try { await authService.syncAdminRole() } catch { /* deploy/configure the Edge Function to enable email-based Admin provisioning */ }
      const result = await profileService.getProfile(id)
      if (requestId === profileRequest.current) setProfile(result)
    } catch (reason) {
      if (requestId === profileRequest.current) setAuthError(reason instanceof Error ? reason.message : 'Could not load your profile.')
    } finally {
      if (requestId === profileRequest.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) return
    const unsubscribe = authService.onAuthStateChange((_event, session) => { if (active) void loadSession(session?.user.id ?? null) })
    void authService.getSession().then((session) => { if (active) return loadSession(session?.user.id ?? null) }).catch((reason: unknown) => { if (active) { setUserId(null); setProfile(null); setAuthError(reason instanceof Error ? reason.message : 'Could not read your session.') } }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; unsubscribe() }
  }, [loadSession])

  const context: AppContextValue | undefined = userId ? { userId, profile, refreshProfile, updateProfile } : undefined

  async function handleGetStarted() {
    setAuthError('')
    if (!isSupabaseConfigured) {
      navigate('/auth')
      return
    }
    try {
      const session = await authService.getSession()
      if (!session?.user) {
        setUserId(null)
        setProfile(null)
        navigate('/auth')
        return
      }
      await loadSession(session.user.id)
      const currentProfile = await profileService.getProfile(session.user.id)
      setProfile(currentProfile)
      navigate(authenticatedDestination(currentProfile), { replace: true })
    } catch (reason) {
      setUserId(null)
      setProfile(null)
      setAuthError(reason instanceof Error ? reason.message : 'Could not verify your session. Sign in to continue.')
      navigate('/auth')
    }
  }

  async function signOut() {
    setAuthError('')
    try {
      await authService.signOut()
      profileRequest.current += 1
      setUserId(null)
      setProfile(null)
      navigate('/auth', { replace: true })
    } catch (reason) { setAuthError(reason instanceof Error ? reason.message : 'Could not sign out.') }
  }

  return <><Routes><Route path="/" element={<GuestStart onGetStarted={handleGetStarted} checkingSession={loading} activeRole={profile?.role && profile.role !== 'Admin' ? profile.role : null} />} /><Route path="/auth" element={<AuthPageRoute isLoading={loading} userId={userId} profile={profile}><AuthEntry /></AuthPageRoute>} /><Route path="/login" element={<AuthPageRoute isLoading={loading} userId={userId} profile={profile}><Login /></AuthPageRoute>} /><Route path="/forgot-password" element={<AuthPageRoute isLoading={loading} userId={userId} profile={profile}><PasswordRecovery /></AuthPageRoute>} /><Route path="/create-account" element={<AuthPageRoute isLoading={loading} userId={userId} profile={profile}><CreateAccount /></AuthPageRoute>} /><Route element={<ProtectedRoute isLoading={loading} userId={userId} profile={profile} stage="role" context={context} />}><Route path="/select-role" element={<SelectRole />} /></Route><Route element={<ProtectedRoute isLoading={loading} userId={userId} profile={profile} stage="profile" context={context} />}><Route path="/profile-setup" element={<ProfileSetup />} /></Route><Route element={<ProtectedRoute isLoading={loading} userId={userId} profile={profile} context={context} />}><Route element={<AppLayout profile={profile} onSignOut={() => void signOut()} />}><Route path="/home" element={profile?.role === 'Admin' ? <Navigate to="/admin/rental-payments" replace /> : profile?.role === 'Farmer' ? <ExploreHome /> : profile?.role === 'Equipment Owner' ? <EquipmentOwnerDashboard path="/home" /> : <Home />} /><Route element={<ProtectedRoute isLoading={false} userId={userId} profile={profile} allowedRoles={["Farmer"]} context={context} />}><Route path="/farmer/*" element={<FarmerRoutes />} /></Route><Route path="/profile" element={profile?.role === 'Farmer' ? <FarmerProfile /> : <ProfilePage profile={profile} />} /><Route path="/notifications" element={profile?.role === 'Farmer' ? <FarmerNotifications /> : <NotificationsPage />} /><Route path="/search" element={<SearchPage />} />{routeItems.filter((route) => !route.roles.includes('Farmer') && route.path !== '/equipment-owner/equipment').map((route) => { const Dashboard = dashboards[route.roles[0]]; return <Route key={route.path} element={<ProtectedRoute isLoading={false} userId={userId} profile={profile} allowedRoles={route.roles} context={context} />}><Route path={route.path} element={<Dashboard {...route} />} /></Route> })}<Route element={<ProtectedRoute isLoading={false} userId={userId} profile={profile} allowedRoles={['Equipment Owner']} context={context} />}><Route path="/equipment-owner/equipment/*" element={<EquipmentManagementRoutes />} /></Route><Route element={<ProtectedRoute isLoading={false} userId={userId} profile={profile} allowedRoles={['Admin']} context={context} />}><Route path="/admin/rental-payments" element={<RentalPayments />} /></Route><Route element={<ProtectedRoute isLoading={false} userId={userId} profile={profile} allowedRoles={['Customer']} context={context} />}><Route path="/shop" element={<CustomerDashboard path="/shop" title="Fresh from the farm" table="products" description="Browse products listed by KHETIGO sellers." />} /></Route><Route element={<ProtectedRoute isLoading={false} userId={userId} profile={profile} allowedRoles={['Event Manager']} context={context} />}><Route path="/event-manager/events" element={<RoleFeaturePage role="Event Manager" title="Events" />} /><Route path="/event-manager/events/create" element={<RoleFeaturePage role="Event Manager" title="Create Event" />} /><Route path="/event-manager/bookings" element={<RoleFeaturePage role="Event Manager" title="Bookings" />} /></Route><Route element={<ProtectedRoute isLoading={false} userId={userId} profile={profile} allowedRoles={['Food Seller']} context={context} />}><Route path="/food-seller/menu" element={<RoleFeaturePage role="Food Seller" title="Menu" />} /><Route path="/food-seller/menu/add" element={<RoleFeaturePage role="Food Seller" title="Add Food" />} /><Route path="/food-seller/orders" element={<RoleFeaturePage role="Food Seller" title="Orders" />} /></Route><Route path="*" element={<Navigate to="/home" replace />} /></Route></Route></Routes><AuxiliaryRoutes />{authError && <div className="global-error" role="alert">{authError}<button onClick={() => setAuthError('')} aria-label="Dismiss">Ã—</button></div>}</>
}

function ProfilePage({ profile }: { profile: UserProfile | null }) {
  if (profile?.role === 'Equipment Owner') {
    return <PlainPage title="My profile" className="owner-profile-page"><div className="profile-summary"><ProfileAvatar className="profile-picture" url={profile.avatar_url} name={profile.full_name} imageAlt="Profile" /><div><h2>{profile.full_name}</h2><p>{profile.role}</p></div></div><dl className="profile-details"><dt>Email</dt><dd>{profile.email}</dd><dt>Phone</dt><dd>{profile.phone || 'Not provided'}</dd><dt>Address</dt><dd>{[profile.address, profile.village, profile.district, profile.state, profile.pin_code].filter(Boolean).join(', ') || 'Not provided'}</dd></dl><Link className="button button-outline" to="/profile-setup">Edit profile</Link></PlainPage>
  }
  return <PlainPage title="My profile"><div className="profile-summary"><ProfileAvatar className="profile-picture" url={profile?.avatar_url} name={profile?.full_name} imageAlt="Profile" /><div><h2>{profile?.full_name}</h2><p>{profile?.role}</p></div></div><dl className="profile-details"><dt>Email</dt><dd>{profile?.email}</dd><dt>Phone</dt><dd>{profile?.phone || 'Not provided'}</dd><dt>Address</dt><dd>{[profile?.address, profile?.village, profile?.district, profile?.state, profile?.pin_code].filter(Boolean).join(', ') || 'Not provided'}</dd></dl><Link className="button button-outline" to="/profile-setup">Edit profile</Link></PlainPage>
}

export default function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>
}
