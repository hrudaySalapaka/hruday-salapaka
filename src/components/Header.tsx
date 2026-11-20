import { useState, type FormEvent } from 'react'
import { Bell, MapPin, Search, ShoppingCart, Sprout } from 'lucide-react'
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
  const navigate = useNavigate()

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = query.trim()
    if (value) navigate(`/search?q=${encodeURIComponent(value)}`)
  }

  return (
    <header className="site-header">
      <Link className="brand" to="/home" aria-label="KHETIGO home">
        <span className="brand-mark"><Sprout size={25} /></span>
        <span className="brand-copy"><strong>KHETIGO</strong><small>Smart Farm Connect</small></span>
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
      <nav className="header-actions" aria-label="Account tools">
        <Link className="icon-action" to="/notifications" aria-label="Notifications"><Bell size={20} /></Link>
        {user?.role === 'Customer' && <Link className="icon-action cart-action" to="/cart" aria-label="Shopping cart"><ShoppingCart size={20} /></Link>}
        <Link className="profile-action" to="/profile"><ProfileAvatar className="profile-avatar" url={user?.avatar_url} name={user?.full_name} ariaHidden /><span>{user?.full_name?.split(' ')[0] || 'Account'}</span></Link>
        <button className="signout-action" onClick={onSignOut}>Sign out</button>
      </nav>
    </header>
  )
}
