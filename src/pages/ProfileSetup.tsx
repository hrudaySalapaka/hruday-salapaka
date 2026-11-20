import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Camera, LocateFixed, Sprout } from 'lucide-react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { requireSupabase } from '../lib/supabase'
import type { AppContextValue, ProfileInput, UserRole } from '../types/user'
import { profileService } from '../services/profileService'
import './ProfileSetup.css'

type SearchOption = { label: string; value: string }
type PostalOffice = { office_name?: string; pincode?: string; district?: string; state?: string }

function SearchDropdown({
  label, value, options, onChange, onSelect, placeholder, disabled = false, loading = false,
}: {
  label: string
  value: string
  options: SearchOption[]
  onChange: (value: string) => void
  onSelect: (option: SearchOption) => void
  placeholder: string
  disabled?: boolean
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const visibleOptions = options.filter((option) => option.label.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase())).slice(0, 80)

  useEffect(() => {
    if (!open) return
    function closeOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  function choose(option: SearchOption) {
    onChange(option.value)
    onSelect(option)
    setOpen(false)
    setActiveIndex(-1)
  }

  return (
    <div className="profile-location-select" ref={rootRef}>
      <label>{label}
        <span className="profile-location-input-wrap">
          <input
            value={value}
            onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(-1) }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActiveIndex((index) => Math.min(index + 1, visibleOptions.length - 1)) }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)) }
              if (event.key === 'Enter' && open && activeIndex >= 0 && visibleOptions[activeIndex]) { event.preventDefault(); choose(visibleOptions[activeIndex]) }
              if (event.key === 'Escape') setOpen(false)
            }}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            aria-label={label}
            aria-expanded={open && !disabled}
            aria-haspopup="listbox"
          />
          <button type="button" className="profile-location-arrow" aria-label={`Show ${label} suggestions`} disabled={disabled} onClick={() => setOpen((shown) => !shown)}>⌄</button>
        </span>
      </label>
      {open && !disabled && <div className="profile-location-options" role="listbox">
        {loading && <div className="profile-location-option is-status">Loading suggestions…</div>}
        {!loading && visibleOptions.length === 0 && <div className="profile-location-option is-status">No match. You can enter this manually.</div>}
        {!loading && visibleOptions.map((option, index) => <button type="button" role="option" aria-selected={index === activeIndex} className={`profile-location-option${index === activeIndex ? ' is-active' : ''}`} key={`${option.value}-${index}`} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option.label}</button>)}
      </div>}
    </div>
  )
}

const COUNTRIES_API = 'https://countriesnow.space/api/v0.1'
const POSTAL_API = 'https://api.pincodeapi.in/api/v1'

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`Location lookup failed (${response.status}).`)
  return response.json()
}

async function normalizeProfileImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image conversion is unavailable in this browser.')
    context.drawImage(bitmap, 0, 0)
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Could not convert this image.')), 'image/png')
    })
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'profile-photo'
    return new File([png], `${baseName}.png`, { type: 'image/png', lastModified: file.lastModified })
  } finally {
    bitmap.close()
  }
}

function stringList(payload: unknown, ...keys: string[]): string[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>
  for (const key of keys) {
    const value = data[key]
    if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : item && typeof item === 'object' ? String((item as Record<string, unknown>).name ?? '') : '').filter(Boolean)
  }
  return []
}

function postalOffices(payload: unknown): PostalOffice[] {
  if (!payload || typeof payload !== 'object') return []
  const root = payload as Record<string, unknown>
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>
  const rows = data.post_offices ?? data.postOffices ?? data.offices
  return Array.isArray(rows) ? rows.filter((row): row is PostalOffice => !!row && typeof row === 'object') : []
}

const roleFields: Partial<Record<UserRole, { key: string; label: string; placeholder: string }[]>> = {
  Farmer: [{ key: 'farm_name', label: 'Farm name', placeholder: 'Your farm or business name' }, { key: 'farm_size', label: 'Farm size', placeholder: 'e.g. 4 acres' }],
  'Equipment Owner': [{ key: 'business_name', label: 'Business name', placeholder: 'Optional business name' }],
  'Delivery Partner': [{ key: 'vehicle_type', label: 'Vehicle type', placeholder: 'e.g. Two wheeler, mini truck' }],
  'Ride Booking Partner': [{ key: 'vehicle_type', label: 'Vehicle type', placeholder: 'Bike, auto or car' }, { key: 'vehicle_number', label: 'Vehicle number', placeholder: 'Registration number' }],
  'Market Seller': [{ key: 'shop_name', label: 'Shop name', placeholder: 'Your shop or market name' }],
}

const profileSteps = [
  { label: 'Account', icon: '👤', status: 'complete' },
  { label: 'Role', icon: '🏷️', status: 'complete' },
  { label: 'Profile', icon: '⚙️', status: 'current' },
] as const

export default function ProfileSetup() {
  const { userId, profile, updateProfile } = useOutletContext<AppContextValue>()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [country, setCountry] = useState('India')
  const [state, setState] = useState(profile?.state ?? '')
  const [district, setDistrict] = useState(profile?.district ?? '')
  const [village, setVillage] = useState(profile?.village ?? '')
  const [pinCode, setPinCode] = useState(profile?.pin_code ?? '')
  const [countries, setCountries] = useState<SearchOption[]>([{ label: 'India', value: 'India' }])
  const [states, setStates] = useState<SearchOption[]>([])
  const [districts, setDistricts] = useState<SearchOption[]>([])
  const [villages, setVillages] = useState<SearchOption[]>([])
  const [pinCodes, setPinCodes] = useState<SearchOption[]>([])
  const [villagePinMap, setVillagePinMap] = useState<Record<string, string[]>>({})
  const [countryLoading, setCountryLoading] = useState(false)
  const [stateLoading, setStateLoading] = useState(false)
  const [districtLoading, setDistrictLoading] = useState(false)
  const [villageLoading, setVillageLoading] = useState(false)
  const [address, setAddress] = useState(profile?.address ?? '')
  const [location, setLocation] = useState(profile?.location ?? null)
  const [roleInfo, setRoleInfo] = useState<Record<string, string>>(profile?.role_info ?? {})
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoProcessing, setPhotoProcessing] = useState(false)
  const [preview, setPreview] = useState(profile?.avatar_url ?? '')
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [stepsOpen, setStepsOpen] = useState(false)
  const stepsMenuRef = useRef<HTMLDivElement>(null)
  const fields = roleFields[profile?.role ?? 'Customer'] ?? []

  useEffect(() => {
    let active = true
    setCountryLoading(true)
    fetchJson(`${COUNTRIES_API}/countries/iso`)
      .then((payload) => {
        const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
        const data = Array.isArray(root.data) ? root.data : []
        const values = data.map((entry) => {
          if (typeof entry === 'string') return entry
          if (!entry || typeof entry !== 'object') return ''
          const item = entry as Record<string, unknown>
          return String(item.name ?? item.country ?? '')
        }).filter(Boolean)
        if (active && values.length) setCountries(Array.from(new Set([...values, 'India'])).sort((a, b) => a.localeCompare(b)).map((name) => ({ label: name, value: name })))
      })
      .catch(() => { /* Keep India as a usable fallback and allow manual entry. */ })
      .finally(() => { if (active) setCountryLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const match = countries.find((option) => option.value.toLocaleLowerCase() === country.trim().toLocaleLowerCase())
    if (!match) { setStates([]); return }
    let active = true
    setStateLoading(true)
    setStates([])
    fetchJson(`${COUNTRIES_API}/countries/states`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: match.value }) })
      .then((payload) => {
        const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
        const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : {}
        const values = stringList(payload, 'states').length ? stringList(payload, 'states') : Array.isArray(data.states) ? data.states.map((entry) => typeof entry === 'string' ? entry : String((entry as Record<string, unknown>)?.name ?? '')).filter(Boolean) : []
        if (active) setStates(Array.from(new Set(values)).sort((a, b) => a.localeCompare(b)).map((name) => ({ label: name, value: name })))
      })
      .catch(() => { if (active) setStates([]) })
      .finally(() => { if (active) setStateLoading(false) })
    return () => { active = false }
  }, [country, countries])

  useEffect(() => {
    const match = states.find((option) => option.value.toLocaleLowerCase() === state.trim().toLocaleLowerCase())
    if (!match) { setDistricts([]); return }
    let active = true
    setDistrictLoading(true)
    setDistricts([])
    const lookup = country.toLocaleLowerCase() === 'india'
      ? fetchJson(`${POSTAL_API}/state/${encodeURIComponent(match.value)}`).then((payload) => postalOffices(payload).map((office) => office.district ?? '').filter(Boolean))
      : fetchJson(`${COUNTRIES_API}/countries/state/cities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country, state: match.value }) }).then((payload) => stringList(payload, 'cities'))
    lookup.then((values) => {
      if (active) setDistricts(Array.from(new Set(values)).sort((a, b) => a.localeCompare(b)).map((name) => ({ label: name, value: name })))
    }).catch(() => { if (active) setDistricts([]) }).finally(() => { if (active) setDistrictLoading(false) })
    return () => { active = false }
  }, [country, state, states])

  useEffect(() => {
    const match = districts.find((option) => option.value.toLocaleLowerCase() === district.trim().toLocaleLowerCase())
    if (!match || country.toLocaleLowerCase() !== 'india') { setVillages([]); setPinCodes([]); setVillagePinMap({}); return }
    let active = true
    setVillageLoading(true)
    setVillages([])
    fetchJson(`${POSTAL_API}/district/${encodeURIComponent(match.value)}`)
      .then((payload) => {
        const offices = postalOffices(payload).filter((office) => !office.state || office.state.toLocaleLowerCase() === state.toLocaleLowerCase())
        const byName = new Map<string, Set<string>>()
        offices.forEach((office) => {
          const name = office.office_name?.trim()
          if (!name) return
          const pins = byName.get(name) ?? new Set<string>()
          if (office.pincode && /^\d{6}$/.test(office.pincode)) pins.add(office.pincode)
          byName.set(name, pins)
        })
        if (active) {
          const entries = Array.from(byName.entries()).sort(([a], [b]) => a.localeCompare(b))
          setVillages(entries.map(([name]) => ({ label: name, value: name })))
          setVillagePinMap(Object.fromEntries(entries.map(([name, pins]) => [name, Array.from(pins)])))
          setPinCodes([])
        }
      })
      .catch(() => { if (active) setVillages([]) })
      .finally(() => { if (active) setVillageLoading(false) })
    return () => { active = false }
  }, [country, district, districts, state])

  function chooseVillage(option: SearchOption) {
    setVillage(option.value)
    const pins = villagePinMap[option.value] ?? []
    setPinCodes(pins.map((pin) => ({ label: pin, value: pin })))
    setPinCode(pins.length === 1 ? pins[0] : '')
  }

  useEffect(() => {
    if (!stepsOpen) return
    function closeOnOutsideClick(event: PointerEvent) {
      if (!stepsMenuRef.current?.contains(event.target as Node)) setStepsOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setStepsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [stepsOpen])

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if ((file.type && !file.type.startsWith('image/')) || file.size > 5 * 1024 * 1024) {
      setError('Choose an image file up to 5 MB.')
      event.target.value = ''
      return
    }
    setError('')
    setPhotoProcessing(true)
    try {
      const compatibleImage = await normalizeProfileImage(file)
      if (compatibleImage.size > 5 * 1024 * 1024) throw new Error('The converted image is larger than 5 MB. Choose a smaller image.')
      setPhoto(compatibleImage)
      setPreview(URL.createObjectURL(file))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This image could not be prepared. Try another image file.')
      event.target.value = ''
    } finally {
      setPhotoProcessing(false)
    }
  }

  function locate() {
    if (!navigator.geolocation) return setError('Location is not available in this browser.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocation({ lat: coords.latitude, lng: coords.longitude }); setLocating(false) },
      () => { setError('Could not access your location. You can enter your address below.'); setLocating(false) },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (fullName.trim().length < 2) return setError('Enter your full name.')
    if (!state.trim() || !district.trim() || !village.trim() || !address.trim()) return setError('Complete your state, district, village and address.')
    if (!/^\d{6}$/.test(pinCode.trim())) return setError('Enter a valid 6-digit PIN code.')
    setLoading(true)
    let saveStep = 'profile photo upload'
    try {
      const { data: { user }, error: authError } = await requireSupabase().auth.getUser()
      if (authError) throw authError
      if (!user || user.id !== userId) throw new Error('Your session expired. Sign in again to save your profile.')
      const authenticatedUserId = user.id
      let uploadedAvatarUrl: string | undefined
      let avatarPath = profile?.avatar_path ?? null
      if (photo) {
        const uploadedAvatar = await profileService.uploadAvatar(authenticatedUserId, photo)
        avatarPath = uploadedAvatar.path
        uploadedAvatarUrl = uploadedAvatar.url
      }
      const input: ProfileInput = { full_name: fullName.trim(), phone: phone.trim() || null, avatar_path: avatarPath, state: state.trim(), district: district.trim(), village: village.trim(), pin_code: pinCode.trim(), address: address.trim(), location, role_info: roleInfo }
      // Role selection creates this row first. Update that own row directly so
      // this step cannot fall through an upsert's INSERT path under RLS.
      saveStep = 'profile update'
      const savedProfile = await profileService.updateProfile(authenticatedUserId, input, uploadedAvatarUrl)
      if (!savedProfile.profile_complete) throw new Error('Your profile was saved but is still incomplete. Check the required profile details and try again.')
      updateProfile(savedProfile)
      navigate('/home', { replace: true })
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : 'Unknown error.'
      setError(`Could not complete ${saveStep}: ${detail}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="profile-setup-screen onboarding-page">
      <style>{`
        .profile-progress-control{position:absolute;z-index:8;top:19px;right:20px}
        .profile-progress-toggle{display:grid;width:44px;height:44px;place-items:center;color:#f4d978;border:1px solid rgba(212,175,55,.68);border-radius:13px;background:linear-gradient(145deg,#174b38,#0c2b21);box-shadow:0 7px 20px rgba(0,0,0,.3),0 0 16px rgba(212,175,55,.09);font-size:21px;line-height:1;cursor:pointer;transition:transform 180ms ease,box-shadow 180ms ease,background 180ms ease}
        .profile-progress-toggle:hover{transform:translateY(-2px);background:linear-gradient(145deg,#1c6247,#103627);box-shadow:0 10px 23px rgba(0,0,0,.34),0 0 20px rgba(212,175,55,.17)}
        .profile-progress-toggle:focus-visible{outline:2px solid #ffd700;outline-offset:3px}
        .profile-progress-dropdown{position:absolute;top:52px;right:0;width:min(258px,calc(100vw - 44px));padding:8px;border:1px solid rgba(212,175,55,.42);border-radius:16px;background:linear-gradient(155deg,#123c2d,#0b211a);box-shadow:0 18px 40px rgba(0,0,0,.46),0 0 24px rgba(212,175,55,.1);transform-origin:top right;transition:opacity 180ms ease,transform 180ms cubic-bezier(.2,.75,.25,1),visibility 0s linear}
        .profile-progress-dropdown.is-closed{visibility:hidden;opacity:0;pointer-events:none;transform:translateY(-7px) scale(.97);transition-delay:0s,0s,180ms}
        .profile-progress-dropdown.is-open{visibility:visible;opacity:1;pointer-events:auto;transform:translateY(0) scale(1);transition-delay:0s}
        .profile-progress-list{display:grid;gap:5px;margin:0;padding:0;list-style:none}
        .profile-progress-step{display:flex;min-height:49px;align-items:center;gap:11px;padding:8px 11px;border:1px solid transparent;border-radius:11px;color:#c2c8c4;font-size:13px;font-weight:570;transition:background 160ms ease,color 160ms ease,border-color 160ms ease}
        .profile-progress-step.is-complete{color:#e9e2ce}
        .profile-progress-step.is-current{color:#ffe17a;border-color:rgba(255,215,0,.37);background:linear-gradient(100deg,rgba(212,175,55,.17),rgba(255,255,255,.035));box-shadow:inset 0 1px rgba(255,255,255,.06)}
        .profile-progress-icon{display:grid;width:31px;height:31px;flex:0 0 31px;place-items:center;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:rgba(255,255,255,.06);font-size:16px}
        .profile-progress-step.is-current .profile-progress-icon{border-color:rgba(255,215,0,.48);background:rgba(212,175,55,.15)}
        .profile-setup-screen .avatar-drop input{display:none}
        .profile-location-select{position:relative;min-width:0}
        .profile-location-input-wrap{position:relative;display:block;margin-top:8px}
        .profile-location-input-wrap input{width:100%;padding-right:42px}
        .profile-location-arrow{position:absolute;top:50%;right:10px;display:grid;width:29px;height:29px;place-items:center;transform:translateY(-50%);border:0;border-radius:8px;background:rgba(255,255,255,.07);color:#d4af37;font-size:19px;line-height:1;cursor:pointer}
        .profile-location-arrow:disabled{opacity:.45;cursor:not-allowed}
        .profile-location-options{position:absolute;z-index:20;top:calc(100% + 5px);left:0;right:0;max-height:230px;overflow-y:auto;padding:5px;border:1px solid rgba(212,175,55,.32);border-radius:11px;background:#10291f;box-shadow:0 12px 28px rgba(0,0,0,.3)}
        .profile-location-option{display:block;width:100%;padding:9px 10px;border:0;border-radius:7px;background:transparent;color:#f1f2ec;text-align:left;font:inherit;cursor:pointer}
        .profile-location-option:hover,.profile-location-option.is-active{background:rgba(212,175,55,.16);color:#ffe17a}
        .profile-location-option.is-status{color:#b0b9b2;font-size:12px;cursor:default}
        .profile-location-hint{grid-column:1/-1;margin:-8px 0 0;color:#9fa9a1;font-size:11px}
        .profile-progress-label{flex:1}
        .profile-progress-check{display:grid;width:20px;height:20px;place-items:center;color:#153b2b;border-radius:50%;background:linear-gradient(145deg,#ffe991,#d4af37);font-size:13px;font-weight:900}
        .profile-progress-current-mark{width:7px;height:7px;margin-right:6px;border-radius:50%;background:#ffd700;box-shadow:0 0 10px rgba(255,215,0,.6)}
        @media(max-width:560px){.profile-progress-control{top:13px;right:13px}.profile-progress-toggle{width:40px;height:40px}.profile-progress-dropdown{top:47px}}
        @media(prefers-reduced-motion:reduce){.profile-progress-toggle,.profile-progress-dropdown,.profile-progress-step{transition-duration:.01ms}}
      `}</style>
      <div className="profile-setup-shell">
        <Link to="/select-role" className="onboarding-back"><ArrowLeft size={17} /> Back to role</Link>
        <section className="onboarding-card profile-card profile-setup-card">
          <div className="profile-progress-control" ref={stepsMenuRef}>
            <button
              type="button"
              className="profile-progress-toggle"
              onClick={() => setStepsOpen((open) => !open)}
              aria-label={stepsOpen ? 'Close setup steps' : 'Open setup steps'}
              aria-haspopup="true"
              aria-expanded={stepsOpen}
              aria-controls="profile-progress-dropdown"
            >
              ☰
            </button>
            <div
              id="profile-progress-dropdown"
              className={`profile-progress-dropdown ${stepsOpen ? 'is-open' : 'is-closed'}`}
              aria-hidden={!stepsOpen}
            >
              <ol className="profile-progress-list" aria-label="Profile setup progress">
                {profileSteps.map((step) => (
                  <li key={step.label} className={`profile-progress-step is-${step.status}`} aria-current={step.status === 'current' ? 'step' : undefined}>
                    <span className="profile-progress-icon" aria-hidden="true">{step.icon}</span>
                    <span className="profile-progress-label">{step.label}</span>
                    {step.status === 'complete' ? <span className="profile-progress-check" aria-label="Completed">✓</span> : step.status === 'current' ? <span className="profile-progress-current-mark" aria-hidden="true" /> : null}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <header className="profile-setup-brand" aria-label="KhetiGo profile setup">
            <span className="profile-setup-brand-mark"><Sprout size={24} strokeWidth={1.7} /></span>
            <span><strong>KHETIGO</strong><small>SMART FARM CONNECT</small></span>
          </header>
          <div className="auth-heading onboarding-heading profile-setup-heading">
            <div className="eyebrow">YOUR KHETIGO PROFILE</div>
            <h1>Set up your profile</h1>
            <p>Help people nearby know who they’re connecting with.</p>
          </div>
          {error && <div className="notice notice-error" role="alert">{error}</div>}
          <form className="form-stack profile-form" onSubmit={submit}>
            <div className="avatar-upload">
              <label htmlFor="profile-photo" className="avatar-drop">
                {preview ? <img src={preview} alt="Profile preview" onError={() => setPreview('')} /> : <span><Camera size={23} /></span>}
                <input id="profile-photo" type="file" accept="image/*" onChange={pickPhoto} />
              </label>
              <div><strong>Profile photo</strong><small>{photoProcessing ? 'Preparing image…' : 'Image files · up to 5 MB'}</small></div>
            </div>
            <label>Full name<input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
            <label>Phone number <span className="optional-label">Optional</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" /></label>
            <div className="form-grid">
              <SearchDropdown label="Country" value={country} options={countries} loading={countryLoading} placeholder="Search country" onChange={(value) => { if (value !== country) { setCountry(value); setState(''); setDistrict(''); setVillage(''); setPinCode(''); setStates([]); setDistricts([]); setVillages([]); setPinCodes([]) } }} onSelect={(option) => { setCountry(option.value); setState(''); setDistrict(''); setVillage(''); setPinCode(''); setDistricts([]); setVillages([]); setPinCodes([]) }} />
              <SearchDropdown label="State" value={state} options={states} loading={stateLoading} placeholder={country ? 'Search state' : 'Choose a country first'} disabled={!country} onChange={(value) => { if (value !== state) { setState(value); setDistrict(''); setVillage(''); setPinCode(''); setDistricts([]); setVillages([]); setPinCodes([]) } }} onSelect={(option) => { setState(option.value); setDistrict(''); setVillage(''); setPinCode(''); setVillages([]); setPinCodes([]) }} />
              <SearchDropdown label="District" value={district} options={districts} loading={districtLoading} placeholder={state ? 'Search district' : 'Choose a state first'} disabled={!state} onChange={(value) => { if (value !== district) { setDistrict(value); setVillage(''); setPinCode(''); setVillages([]); setPinCodes([]) } }} onSelect={(option) => { setDistrict(option.value); setVillage(''); setPinCode(''); setPinCodes([]) }} />
              <SearchDropdown label="Village / city" value={village} options={villages} loading={villageLoading} placeholder={district ? 'Search village or enter manually' : 'Choose a district first'} disabled={!district} onChange={(value) => { if (value !== village) { setVillage(value); setPinCode(''); setPinCodes([]) } }} onSelect={chooseVillage} />
              <SearchDropdown label="PIN code" value={pinCode} options={pinCodes} placeholder="Enter PIN code" disabled={!village} onChange={(value) => setPinCode(value.replace(/\D/g, '').slice(0, 6))} onSelect={(option) => setPinCode(option.value)} />
              {country.toLocaleLowerCase() !== 'india' && <small className="profile-location-hint">Detailed village and postal suggestions are not available for this country. You can enter them manually.</small>}
              {country.toLocaleLowerCase() === 'india' && village && pinCodes.length > 1 && <small className="profile-location-hint">Select the matching PIN code, or enter it manually.</small>}
            </div>
            <label>Address<textarea rows={3} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Door number, street, landmark" required /></label>
            <button className="location-detect" type="button" onClick={locate} disabled={locating}>
              <LocateFixed size={17} />{locating ? 'Finding your location…' : location ? 'Location captured' : 'Use current location (optional)'}
            </button>
            {location && <small className="location-coordinates">Location attached · {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</small>}
            {fields.length > 0 && (
              <section className="role-info-fields">
                <h2><Sprout size={19} /> {profile?.role} details <span>Optional</span></h2>
                {fields.map((field) => <label key={field.key}>{field.label}<input value={roleInfo[field.key] ?? ''} onChange={(event) => setRoleInfo((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} /></label>)}
              </section>
            )}
            <button className="button button-primary button-wide profile-setup-submit" type="submit" disabled={loading || photoProcessing}>
              {loading ? <><span className="spinner spinner-small" /> Saving profile…</> : <>Save and continue <ArrowRight size={18} /></>}
            </button>
          </form>
          <p className="profile-setup-footnote">Your details help connect you with people and services near you.</p>
        </section>
      </div>
    </main>
  )
}
