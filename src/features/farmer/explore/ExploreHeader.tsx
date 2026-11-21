import { Bell, MapPin, Search, Settings, ShoppingCart } from 'lucide-react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { useEffect, useState, type FormEvent } from 'react'
import type { UserProfile } from '../../../types/user'
import ProfileAvatar from '../../../components/ProfileAvatar'
import type { AppContextValue } from '../../../types/user'
import { requireSupabase } from '../../../lib/supabase'
import './ExploreHeader.css'

export default function ExploreHeader({ profile, onSignOut }: { profile: UserProfile | null; onSignOut: () => void }) {
  const { userId } = useOutletContext<AppContextValue>()
  const locationPath = useLocation().pathname
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [cartCount, setCartCount] = useState(0)
  const location = [profile?.village, profile?.district].filter(Boolean).join(', ') || 'Set your farm location'
  useEffect(() => {
    let active = true
    const load = async () => { try { const { data, error } = await requireSupabase().from('farmer_equipment_cart_items').select('quantity').eq('user_id', userId); if (error) throw error; if (active) setCartCount((data ?? []).reduce((total, item) => total + Number(item.quantity || 0), 0)) } catch { if (active) setCartCount(0) } }
    const refresh = () => { void load() }
    void load(); window.addEventListener('farmer-rental-cart-changed', refresh)
    return () => { active = false; window.removeEventListener('farmer-rental-cart-changed', refresh) }
  }, [userId])
  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); navigate(`/farmer/home?q=${encodeURIComponent(search.trim())}`) }
  return <header className="fx-header"><Link to="/home" className="fx-brand" aria-label="KHETIGO home"><img className="brand-emblem" src="/WhatsApp%20Image%202026-11-21%20at%206.52.38%20PM.jpeg" alt="KHETIGO" /></Link><Link to="/farmer/farms" className="fx-location"><MapPin size={17} /><span><small>DELIVERING NEAR</small><strong>{location}</strong></span></Link><form className="fx-nav-search" onSubmit={submitSearch}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tractors, harvesters, tools" aria-label="Search agricultural equipment" /><button type="submit" aria-label="Search"><Search size={17} /></button></form><div className="fx-header-actions"><Link className="fx-cart-link" to="/farmer/cart" aria-label={`Rental cart, ${cartCount} items`} title="Rental cart"><ShoppingCart size={20} /><span>Cart</span>{cartCount > 0 && <b>{cartCount}</b>}</Link><Link to="/notifications" aria-label="Notifications" title="Notifications"><Bell size={19} /></Link>{locationPath === '/profile' && <Link to="/farmer/settings" aria-label="Settings" title="Settings"><Settings size={19} /></Link>}<Link to="/profile" className="fx-avatar" aria-label="Farmer profile"><ProfileAvatar className="fx-avatar-image" url={profile?.avatar_url} name={profile?.full_name} /></Link><button type="button" className="fx-signout" onClick={onSignOut}>Sign out</button></div></header>
}
