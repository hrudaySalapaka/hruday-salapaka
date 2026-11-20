import { useLayoutEffect, useState, type FormEvent } from 'react'
import { BadgeIndianRupee, Bike, CalendarDays, ChevronDown, MessageCircle, Mic, List, Stethoscope, Store, Video, X, Share2, Tractor, Images, Heart, Sprout, ShoppingBag, Star, ArrowRight, MapPin, Phone, Copy, ImagePlus } from 'lucide-react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import type { AppContextValue, ProfileInput } from '../../../types/user'
import ProfileAvatar from '../../../components/ProfileAvatar'
import { profileService } from '../../../services/profileService'
import './FarmerProfile.css'

export default function FarmerProfile() {
  const { userId, profile, updateProfile } = useOutletContext<AppContextValue>()
  const location = useLocation()
  const navigate = useNavigate()
  const [serviceReturnState] = useState(() => {
    try { const key = `farmer-profile-return:${userId}`; const value = sessionStorage.getItem(key); sessionStorage.removeItem(key); return value ? JSON.parse(value) as { assistantOpen?: boolean; detailsOpen?: boolean; scrollY?: number } : null } catch { return null }
  })
  const [assistantOpen, setAssistantOpen] = useState(() => serviceReturnState?.assistantOpen ?? window.location.hash === '#assistant')
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(() => serviceReturnState?.detailsOpen ?? false)
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [village, setVillage] = useState(profile?.village ?? '')
  const [district, setDistrict] = useState(profile?.district ?? '')
  const [state, setState] = useState(profile?.state ?? '')
  const [address, setAddress] = useState(profile?.address ?? '')
  const [pinCode, setPinCode] = useState(profile?.pin_code ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [idCardOpen, setIdCardOpen] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  useLayoutEffect(() => { if (serviceReturnState?.scrollY != null) window.scrollTo({ top: serviceReturnState.scrollY, behavior: 'instant' }) }, [serviceReturnState])

  function openFarmerService(service: string) {
    sessionStorage.setItem(`farmer-profile-return:${userId}`, JSON.stringify({ assistantOpen, detailsOpen, scrollY: window.scrollY }))
    navigate(`/farmer/services/${service}`, { state: { fromFarmerProfile: true, returnTo: `${location.pathname}${location.search}${location.hash}` } })
  }

  function openAssistant(path: string) {
    sessionStorage.setItem(`farmer-profile-return:${userId}`, JSON.stringify({ assistantOpen: true, detailsOpen, scrollY: window.scrollY }))
    navigate(path, { state: { fromFarmerProfile: true, returnTo: `${location.pathname}${location.search}${location.hash}` } })
  }

  function startEditing() {
    setPhone(profile?.phone ?? '')
    setVillage(profile?.village ?? '')
    setDistrict(profile?.district ?? '')
    setState(profile?.state ?? '')
    setAddress(profile?.address ?? '')
    setPinCode(profile?.pin_code ?? '')
    setError('')
    setMessage('')
    setEditing(true)
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!profile) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const input: ProfileInput = {
        full_name: profile.full_name,
        phone: phone.trim() || null,
        avatar_path: profile.avatar_path,
        state: state.trim(),
        district: district.trim(),
        village: village.trim(),
        pin_code: pinCode.trim(),
        address: address.trim(),
        location: profile.location,
        role_info: profile.role_info ?? {},
      }
      updateProfile(await profileService.updateProfile(userId, input, profile.avatar_url ?? undefined))
      setEditing(false)
      setMessage('Your profile details have been saved.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your profile details.')
    } finally {
      setSaving(false)
    }
  }

  function closeDetails() {
    setDetailsOpen(false)
    setEditing(false)
    setError('')
    setMessage('')
  }

  const farmLocation = [profile?.village, profile?.district, profile?.state].filter(Boolean).join(', ')
  const profileLocation = typeof profile?.location === 'string' ? profile.location : ''
  const profileId = userId || ''
  const qrPayload = `KHETIGO-FARMER:${profileId}`
  const qrImage = `https://quickchart.io/qr?size=220&text=${encodeURIComponent(qrPayload)}`
  async function shareFarmerId() {
    try {
      if (navigator.share) await navigator.share({ title: `${profile?.full_name || 'Farmer'} · Khetigo`, text: `Farmer profile ID: ${profileId}` })
      else { await navigator.clipboard.writeText(qrPayload); setShareMessage('Farmer profile ID copied.') }
    } catch (reason) { if (reason instanceof Error && reason.name !== 'AbortError') setShareMessage('Could not open the share menu.') }
  }
  const profileSections = [
    { title: 'My Listing', description: 'Manage your farm product listings', Icon: Tractor, href: '/farmer/products' },
    { title: 'Posts, Reels & Social Media', description: 'Capture and share farm updates', Icon: Images, href: '/farmer/assistant/camera' },
    { title: 'Wishlist', description: 'View equipment saved in your rental cart', Icon: Heart, href: '/farmer/cart' },
    { title: 'Problem and Crops Listing', description: 'Manage crop and field records', Icon: Sprout, href: '/farmer/crops' },
    { title: 'My Orders', description: 'Track purchases and rental bookings', Icon: ShoppingBag, href: '/farmer/orders' },
    { title: 'Coupons, Gift Cards & Super Coins', description: 'View your farmer wallet and rewards', Icon: BadgeIndianRupee, href: '/farmer/wallet' },
    { title: 'Review', description: 'Review completed equipment rentals', Icon: Star, href: '/farmer/bookings' },
  ]
  const farmerServices = [
    { title: 'Ride Booking Partner', description: 'Find and book available rides and farm transportation.', Icon: Bike, slug: 'ride-booking-partner' },
    { title: 'Market Seller', description: 'Browse marketplace products and manage selling activities.', Icon: Store, slug: 'market-seller' },
    { title: 'Event Manager', description: 'Discover agricultural events and register for services.', Icon: CalendarDays, slug: 'event-manager' },
    { title: 'Food Seller', description: 'Browse food items and place food orders.', Icon: ShoppingBag, slug: 'food-seller' },
  ]
  const modes = [
    { title: 'AI Doctor Chat', Icon: MessageCircle, href: '/farmer/assistant/chat', position: 'north-west' },
    { title: 'Photo Upload + Chat', Icon: ImagePlus, href: '/farmer/assistant/camera', position: 'north-east' },
    { title: 'AI Doctor Video Call', Icon: Video, href: '/farmer/assistant/video-call', position: 'south-west' },
    { title: 'AI Doctor Voice Chat', Icon: Mic, href: '/farmer/assistant/voice', position: 'south-east' },
  ]

  return <main className="farmer-profile">
    <span className="fx-kicker">FARMER ACCOUNT</span>
    <h1>My profile</h1>
    <section className="farmer-profile-card">
      <div className="farmer-profile-leading">
        <ProfileAvatar className="farmer-profile-avatar" url={profile?.avatar_url} name={profile?.full_name} />
        <div className="farmer-profile-identity"><h2>{profile?.full_name || 'Farmer'}</h2><p><span>{profile?.email}</span><span className="farmer-profile-role">{profile?.role}</span></p></div>
        <button type="button" className={`farmer-profile-expand${detailsOpen ? ' is-open' : ''}`} aria-label={detailsOpen ? 'Collapse profile details' : 'Expand profile details'} aria-expanded={detailsOpen} onClick={() => { setDetailsOpen((open) => !open); setEditing(false); setError(''); setMessage('') }}><ChevronDown size={17} /></button>
      </div>
      <nav className="farmer-profile-actions" aria-label="Farmer account shortcuts">
        <button type="button" className="farmer-profile-action farmer-service-menu-toggle" aria-label={serviceMenuOpen ? 'Close farmer services menu' : 'Open farmer services menu'} title="Farmer services" aria-expanded={serviceMenuOpen} aria-haspopup="menu" aria-controls="farmer-service-menu" onClick={() => setServiceMenuOpen((open) => !open)}><List size={20} /></button>
        <Link className="farmer-profile-action" to="/farmer/wallet" aria-label="Payments and wallet" title="Payments and wallet"><BadgeIndianRupee size={20} /></Link>
        <button type="button" className="farmer-profile-action" aria-label="Share farmer ID card" title="Share farmer ID card" onClick={() => { setIdCardOpen(true); setShareMessage('') }}><Share2 size={19} /></button>
        <div id="assistant" className={`farmer-doctor-orbit${assistantOpen ? ' is-open' : ''}`}>
          {assistantOpen && modes.map(({ title, Icon, href, position }) => <button type="button" key={href} className={`farmer-doctor-orbit-action ${position}`} aria-label={title} title={title} onClick={() => openAssistant(href)}><Icon size={15} /></button>)}
          <button type="button" className="farmer-profile-action doctor-service-action farmer-doctor-orbit-center" aria-label={assistantOpen ? 'Close Doctor Assistant options' : 'Open Doctor Assistant options'} title="Doctor Assistant" aria-expanded={assistantOpen} aria-controls="assistant" onClick={() => setAssistantOpen((open) => !open)}><Stethoscope size={21} /></button>
        </div>
        {serviceMenuOpen && <div className="farmer-role-menu" id="farmer-service-menu" role="menu" aria-label="Farmer service destinations">{farmerServices.map(({ title, description, Icon, slug }) => <button key={slug} type="button" role="menuitem" className="farmer-role-menu-item" onClick={() => openFarmerService(slug)}><span className="farmer-role-menu-icon"><Icon size={19}/></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={16} className="farmer-role-menu-arrow"/></button>)}</div>}
      </nav>
    </section>
    <nav className="farmer-profile-sections" aria-label="Farmer profile sections">{profileSections.map(({ title, description, Icon, href }) => <Link className="farmer-profile-section-link" to={href} key={title}><span className="farmer-profile-section-icon"><Icon size={19}/></span><span><strong>{title}</strong><small>{description}</small></span><ArrowRight size={16} className="farmer-profile-section-arrow"/></Link>)}</nav>
    {idCardOpen && <div className="farmer-id-backdrop" role="presentation" onClick={() => setIdCardOpen(false)}><section className="farmer-id-sheet" role="dialog" aria-modal="true" aria-labelledby="farmer-id-title" onClick={event => event.stopPropagation()}><button type="button" className="farmer-profile-close-icon" aria-label="Close farmer ID card" onClick={() => setIdCardOpen(false)}><X size={18}/></button><div className="farmer-id-heading"><span className="fx-kicker">KHETIGO · FARMER ID</span><h2 id="farmer-id-title">Your farmer card</h2></div><div className="farmer-id-card"><div className="farmer-id-person"><ProfileAvatar className="farmer-id-avatar" url={profile?.avatar_url} name={profile?.full_name}/><h3>{profile?.full_name || 'Farmer'}</h3><div><Phone size={15}/><span>{profile?.phone || 'Phone not provided'}</span></div><div><MapPin size={15}/><span>{farmLocation || profileLocation || 'Location not provided'}</span></div><small>Farmer ID · {profileId ? profileId.slice(0, 8).toUpperCase() : 'Unavailable'}</small></div><div className="farmer-id-qr"><img src={qrImage} alt="Scannable QR code for this farmer profile"/><small>Scan to identify this farmer</small></div></div><div className="farmer-id-actions"><button type="button" className="farmer-profile-save" onClick={() => void shareFarmerId()}><Share2 size={15}/> Share</button><button type="button" className="farmer-profile-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(qrPayload);setShareMessage('Farmer profile ID copied.')}catch{setShareMessage('Could not copy the profile ID.')}}}><Copy size={15}/> Copy ID</button></div>{shareMessage&&<p className="farmer-profile-feedback" role="status">{shareMessage}</p>}</section></div>}
    {detailsOpen && <section className="farmer-profile-detail-card" aria-label="Farmer profile details">
          <button type="button" className="farmer-profile-close-icon" aria-label="Close profile details" onClick={closeDetails}><X size={18} /></button>
          <div className="farmer-profile-detail-heading"><span className="fx-kicker">PROFILE DETAILS</span><h2>{editing ? 'Edit your details' : 'Your contact and farm details'}</h2></div>
          {editing ? <form className="farmer-profile-edit-form" onSubmit={(event) => void saveDetails(event)}>
            <label>Phone number<input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <label>Village / city<input autoComplete="address-level2" value={village} onChange={(event) => setVillage(event.target.value)} /></label>
            <label>District<input autoComplete="address-level3" value={district} onChange={(event) => setDistrict(event.target.value)} /></label>
            <label>State<input autoComplete="address-level1" value={state} onChange={(event) => setState(event.target.value)} /></label>
            <label className="farmer-profile-address-field">Full address<textarea autoComplete="street-address" rows={3} value={address} onChange={(event) => setAddress(event.target.value)} /></label>
            <label>PIN code<input inputMode="numeric" autoComplete="postal-code" maxLength={12} value={pinCode} onChange={(event) => setPinCode(event.target.value)} /></label>
            <div className="farmer-profile-form-actions"><button type="button" className="farmer-profile-secondary" onClick={() => setEditing(false)} disabled={saving}>Cancel edit</button><button type="button" className="farmer-profile-secondary farmer-profile-close-action" onClick={closeDetails} disabled={saving}>Close details</button><button type="submit" className="farmer-profile-save" disabled={saving}>{saving ? 'Saving…' : 'Save details'}</button></div>
          </form> : <><dl className="farmer-profile-details"><dt>Phone</dt><dd>{profile?.phone || 'Not provided'}</dd><dt>Farm location</dt><dd>{farmLocation || 'Not provided'}</dd><dt>Full address</dt><dd>{profile?.address || 'Not provided'}</dd><dt>PIN code</dt><dd>{profile?.pin_code || 'Not provided'}</dd></dl><div className="farmer-profile-detail-actions"><button type="button" className="farmer-profile-save" onClick={startEditing}>Edit details</button><button type="button" className="farmer-profile-secondary" onClick={closeDetails}>Close details</button></div></>}
          {error && <p className="farmer-profile-feedback is-error" role="alert">{error}</p>}{message && <p className="farmer-profile-feedback" role="status">{message}</p>}
    </section>}
  </main>
}
