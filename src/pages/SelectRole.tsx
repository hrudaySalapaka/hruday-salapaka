import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  Bike,
  BadgeCheck,
  Check,
  ClipboardList,
  Clock3,
  ShoppingBag,
  ShieldCheck,
  Sprout,
  Store,
  Tractor,
  Truck,
  X,
} from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { requireSupabase } from '../lib/supabase'
import { profileService } from '../services/profileService'
import type { AppContextValue, PublicUserRole, UserRole } from '../types/user'
import { USER_ROLES } from '../types/user'
import './selectRole.css'

const descriptions: Record<UserRole, string> = {
  Farmer: 'Grow crops and manage your farm.',
  'Equipment Owner': 'Share machinery and manage rentals.',
  Customer: 'Buy directly from Farmers, shop from Market Sellers, and book Car or Bike rides — all in one app.',
  'Delivery Partner': 'Deliver orders and grow your work.',
  'Ride Booking Partner': 'Connect riders with their next trip.',
  'Market Seller': 'Bring your products to the marketplace.',
  'Event Manager': 'Plan celebrations with less stress and bring every detail together.',
  'Food Seller': 'Turn your daily food business into simple, convenient online orders.',
  Admin: 'Manage rental payment verification and settlement.',
}

const icons: Record<UserRole, typeof Sprout> = {
  Farmer: Sprout,
  'Equipment Owner': Tractor,
  Customer: ShoppingBag,
  'Delivery Partner': Truck,
  'Ride Booking Partner': Bike,
  'Market Seller': Store,
  'Event Manager': ClipboardList,
  'Food Seller': ShoppingBag,
  Admin: ShieldCheck,
}

const roleMessages: Record<UserRole, string> = {
  Farmer: 'Grow with confidence. Your fields and next season start here.',
  'Equipment Owner': 'Put your machinery to work and build your rental business.',
  Customer: 'Buy directly from Farmers, shop from Market Sellers, and book Car or Bike rides — all in one app.',
  'Delivery Partner': 'Every delivery can open the door to a new opportunity.',
  'Ride Booking Partner': 'Connect your community with a smoother journey.',
  'Market Seller': 'Share the best of your harvest with more customers.',
  'Event Manager': 'Spend less time juggling event details and more time bringing people together.',
  'Food Seller': 'Serve your customers with a smoother path from today’s menu to online orders.',
  Admin: 'Verify rental payments and manage booking settlement.',
}

// This is the only existing video asset in public; keep its real path and use
// role-specific copy over it rather than inventing six nonexistent video URLs.
const welcomeVideoSrc = '/WhatsApp%20Video%202026-11-14%20at%207.16.07%20PM.mp4'

function saveErrorMessage(reason: unknown): string {
  if (reason && typeof reason === 'object') {
    const error = reason as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }
    if (error.code === 'PGRST202') {
      return 'The connected Supabase project is missing the save_user_role function. Its database schema must be updated before roles can be saved.'
    }
    if (typeof error.message === 'string' && error.message.trim()) return error.message
    if (typeof error.details === 'string' && error.details.trim()) return error.details
    if (typeof error.hint === 'string' && error.hint.trim()) return error.hint
  }
  if (reason instanceof Error && reason.message) return reason.message
  return 'Could not save your role. Check the Supabase role setup and try again.'
}

export default function SelectRole() {
  const { userId, profile, refreshProfile } = useOutletContext<AppContextValue>()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<PublicUserRole | null>(profile?.role === 'Admin' ? null : profile?.role ?? null)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [authVerified, setAuthVerified] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let active = true
    setAuthVerified(false)
    async function verifyAuthentication() {
      try {
        const { data, error: authError } = await requireSupabase().auth.getUser()
        if (!active) return
        const verified = !authError && data.user?.id === userId
        setAuthVerified(verified)
        if (!verified) setError('Your sign-in could not be verified. Sign in again before confirming your profile.')
      } catch {
        if (!active) return
        setAuthVerified(false)
        setError('Your sign-in could not be verified. Sign in again before confirming your profile.')
      }
    }
    void verifyAuthentication()
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!welcomeOpen || !selected) return
    const video = videoRef.current
    if (!video) return
    video.currentTime = 0
    void video.play().catch(() => setVideoFailed(true))
  }, [selected, welcomeOpen])

  function handleRoleSelect(role: PublicUserRole) {
    setSelected(role)
    setError('')
    setVideoReady(false)
    setVideoFailed(false)
    setWelcomeOpen(true)
  }

  function closeWelcome() {
    const video = videoRef.current
    if (video) {
      video.pause()
      video.currentTime = 0
    }
    setWelcomeOpen(false)
    setVideoReady(false)
    setVideoFailed(false)
  }

  async function continueSetup() {
    if (!authVerified) {
      setError('Your sign-in could not be verified. Sign in again before confirming your profile.')
      return
    }
    if (!selected) {
      setError('Please select a role first.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await profileService.saveRole(userId, selected)
      await refreshProfile()
      navigate('/profile-setup')
    } catch (reason) {
      setError(saveErrorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  const WelcomeIcon = selected ? icons[selected] : Sprout

  return (
    <main className="khetigo-role-page">
      {!welcomeOpen && (
        <div className="khetigo-role-container">
          <header className="khetigo-brand" aria-label="KHETIGO Smart Farm Connect">
            <span className="khetigo-logo" aria-hidden="true"><Sprout size={27} strokeWidth={1.7} /></span>
            <span className="khetigo-brand-text">
              <strong>KHETIGO</strong>
              <span>SMART FARM CONNECT</span>
            </span>
          </header>

          <section className="khetigo-heading" aria-labelledby="role-heading">
            <span className="khetigo-eyebrow">YOUR KHETIGO EXPERIENCE</span>
            <h1 id="role-heading">HOW WILL YOU USE KHETIGO?</h1>
            <p>Select a role to preview your welcome. Confirm only when you are ready.</p>
          </section>

          {error && <div className="khetigo-error" role="alert">{error}</div>}

          <section className="khetigo-role-grid" aria-label="Choose your role">
            {USER_ROLES.map((role, index) => {
              const Icon = icons[role]
              const isSelected = selected === role
              return (
                <button
                  type="button"
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  disabled={saving}
                  className={`khetigo-role-card${isSelected ? ' is-selected' : ''}`}
                  aria-pressed={isSelected}
                >
                  <span className="khetigo-role-number">0{index + 1}</span>
                  <span className="khetigo-role-icon"><Icon size={23} strokeWidth={1.7} /></span>
                  <span className="khetigo-role-copy">
                    <strong>{role}</strong>
                    <small>{descriptions[role]}</small>
                  </span>
                  <span className="khetigo-role-check" aria-hidden="true">
                    {isSelected && <Check size={15} strokeWidth={2.5} />}
                  </span>
                </button>
              )
            })}
          </section>

          <div className="khetigo-selection-note">
            {selected ? `Selected: ${selected}` : 'Choose one role to preview the welcome'}
          </div>
        </div>
      )}

      {welcomeOpen && selected && (
        <section className={`khetigo-video-welcome role-${USER_ROLES.indexOf(selected)}`} aria-label={`${selected} welcome`}>
          {!videoFailed ? (
            <video
              key={selected}
              ref={videoRef}
              className="khetigo-welcome-video"
              src={welcomeVideoSrc}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onCanPlay={() => setVideoReady(true)}
              onError={() => { setVideoFailed(true); setVideoReady(false) }}
              aria-label={`KHETIGO welcome video for ${selected}`}
            />
          ) : (
            <div className="khetigo-video-fallback" role="img" aria-label={`${selected} animated welcome illustration`}>
              <span className="fallback-sun" />
              <span className="fallback-hill fallback-hill-back" />
              <span className="fallback-hill fallback-hill-front" />
              <span className="fallback-role-icon"><WelcomeIcon size={72} strokeWidth={1.35} /></span>
              <span className="fallback-spark fallback-spark-one">✦</span>
              <span className="fallback-spark fallback-spark-two">✧</span>
            </div>
          )}
          <div className="khetigo-video-shade" />

          <button
            type="button"
            className="khetigo-video-close"
            onClick={closeWelcome}
            aria-label="Close welcome video and choose another role"
            disabled={saving}
          >
            <X size={24} strokeWidth={2} />
          </button>

          <div className="khetigo-video-copy">
            <span className="khetigo-welcome-label">WELCOME TO KHETIGO</span>
            <h1>Welcome, {selected}!</h1>
            {(selected === 'Event Manager' || selected === 'Food Seller') && (
              <div className={`khetigo-before-after role-concept-${selected === 'Event Manager' ? 'event' : 'food'}`} aria-label={`${selected} before and after concept`}>
                <div className="khetigo-concept-scene concept-before" aria-hidden="true">
                  {selected === 'Event Manager' ? <><ClipboardList size={39} /><Clock3 size={26} /></> : <><Store size={39} /><Clock3 size={26} /></>}
                  <span className="concept-orbit concept-orbit-one" /><span className="concept-orbit concept-orbit-two" />
                </div>
                <span className="khetigo-concept-transition" aria-hidden="true"><ArrowRight size={21} /></span>
                <div className="khetigo-concept-scene concept-after" aria-hidden="true">
                  {selected === 'Event Manager' ? <><ClipboardList size={39} /><BadgeCheck size={26} /></> : <><ShoppingBag size={39} /><BadgeCheck size={26} />
                  </>}
                  <span className="concept-orbit concept-orbit-one" /><span className="concept-orbit concept-orbit-two" />
                </div>
              </div>
            )}
            <p>{roleMessages[selected]}</p>
            {selected === 'Customer' && (
              <section className="khetigo-customer-services" aria-labelledby="customer-services-heading">
                <h2 id="customer-services-heading">Discover Fresh Products and Services</h2>
                <div className="khetigo-customer-service-grid">
                  <article className="khetigo-customer-service">
                    <span className="khetigo-customer-service-icon"><Sprout size={21} strokeWidth={1.8} /></span>
                    <div><h3>BUY CROPS FROM FARMERS</h3><p>Discover and purchase fresh crops and agricultural products directly from Farmers.</p></div>
                  </article>
                  <article className="khetigo-customer-service">
                    <span className="khetigo-customer-service-icon"><Store size={21} strokeWidth={1.8} /></span>
                    <div><h3>BUY PRODUCTS FROM MARKET SELLERS</h3><p>Shop vegetables, fruits, groceries, and other available marketplace products.</p></div>
                  </article>
                  <article className="khetigo-customer-service">
                    <span className="khetigo-customer-service-icon"><Truck size={21} strokeWidth={1.8} /><Bike size={18} strokeWidth={1.8} /></span>
                    <div><h3>BOOK RIDES</h3><p>Book transportation services such as cars and bikes.</p></div>
                  </article>
                </div>
              </section>
            )}
            <strong className="khetigo-all-the-best">ALL THE BEST!</strong>
            {!videoReady && !videoFailed && <span className="khetigo-video-status" role="status">Loading your welcome…</span>}
            {videoFailed && <span className="khetigo-video-status" role="status">Showing animated welcome</span>}
            {error && <div className="khetigo-error khetigo-video-error" role="alert">{error}</div>}
            <button
              type="button"
              className="khetigo-confirm-button"
              onClick={() => void continueSetup()}
              disabled={saving || !authVerified || (!videoReady && !videoFailed)}
            >
              {saving ? (
                <><span className="khetigo-button-spinner" aria-hidden="true" /> Saving your role…</>
              ) : (
                <>CONFIRM YOUR PROFILE <ArrowRight size={17} /></>
              )}
            </button>
          </div>
        </section>
      )}
    </main>
  )
}
