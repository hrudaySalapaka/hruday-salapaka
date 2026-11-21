import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bell, MapPin, Search, ShoppingCart, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import ProfileAvatar from './ProfileAvatar'
import type { UserProfile } from '../types/user'

interface HeaderProps {
  user: UserProfile | null
  onSignOut: () => void
}

export default function Header({ user, onSignOut }: HeaderProps) {
  const [query, setQuery] = useState('')
  const [locationOpen, setLocationOpen] = useState(false)
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false)
  const accountMenuRef = useRef<HTMLElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    function closeOnDesktop() {
      if (window.innerWidth > 720) setMobileAccountOpen(false)
    }
    window.addEventListener('resize', closeOnDesktop)
    return () => window.removeEventListener('resize', closeOnDesktop)
  }, [])

  useEffect(() => {
    if (!mobileAccountOpen) return
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) setMobileAccountOpen(false)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileAccountOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileAccountOpen])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = query.trim()
    if (value) navigate(`/search?q=${encodeURIComponent(value)}`)
  }

  return (
    <header className="site-header">
      <Link className="brand" to="/home" aria-label="KHETIGO home">
        <img className="brand-emblem" src="/WhatsApp%20Image%202026-11-21%20at%206.52.38%20PM.jpeg" alt="KHETIGO" />
      </Link>
      <button className="location-button" onClick={() => setLocationOpen((open) => !open)} aria-expanded={locationOpen}>
        <MapPin size={18} /><span><small>Deliver to</small><strong>{user?.village || 'Set your location'}</strong></span>
      </button>
      {locationOpen && <div className="location-popover">Set your delivery address in <Link to="/profile">Profile &amp; address</Link>.</div>}
      <form className="header-search" role="search" onSubmit={search}>
        <Search size={19} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fresh produce, equipment and more" aria-label="Search KHETIGO" />
        <button type="submit">Search</button>
      </form>
      <nav ref={accountMenuRef} className="header-actions" aria-label="Account tools">
        <Link className="icon-action" to="/notifications" aria-label="Notifications"><Bell size={20} /></Link>
        {user?.role === 'Customer' && <Link className="icon-action cart-action" to="/cart" aria-label="Shopping cart"><ShoppingCart size={20} /></Link>}
        <Link className="profile-action" to="/profile"><ProfileAvatar className="profile-avatar" url={user?.avatar_url} name={user?.full_name} ariaHidden /><span>{user?.full_name?.split(' ')[0] || 'Account'}</span></Link>
        <button type="button" className="mobile-profile-trigger" aria-label={mobileAccountOpen ? 'Close account menu' : 'Open account menu'} aria-expanded={mobileAccountOpen} aria-controls="mobile-account-menu" onClick={() => setMobileAccountOpen((open) => !open)}><ProfileAvatar className="profile-avatar" url={user?.avatar_url} name={user?.full_name} ariaHidden />{mobileAccountOpen ? <X size={15} /> : null}</button>
        <button className="signout-action" onClick={onSignOut}>Sign out</button>
        {mobileAccountOpen && <div className="mobile-account-menu" id="mobile-account-menu"><div className="mobile-account-summary"><ProfileAvatar className="profile-avatar" url={user?.avatar_url} name={user?.full_name} ariaHidden /><span><strong>{user?.full_name || 'Account'}</strong><small>{user?.role || 'KHETIGO account'}</small></span></div><Link to="/profile" onClick={() => setMobileAccountOpen(false)}>Profile and settings</Link><button type="button" className="mobile-account-signout" onClick={() => { setMobileAccountOpen(false); onSignOut() }}>Sign out</button></div>}
      </nav>
    </header>
  )
}
