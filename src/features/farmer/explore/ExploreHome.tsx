import { useEffect, useMemo, useState } from 'react'
import { BadgePercent, CalendarDays, Check, ChevronLeft, ChevronRight, MapPin, PackageCheck, Search, ShieldCheck, ShoppingCart, Sprout, Star, Tractor, Truck } from 'lucide-react'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import { addToCart, getRentals, money, rentalDiscountPercent, rentalRate, type RentalEquipment } from '../services/rentalMarketplace'
import './ExploreHome.css'
import '../styles/RentalMarketplace.css'

const categories = ['All equipment', 'Tractors', 'Harvesters', 'Tillage', 'Planting', 'Irrigation', 'Spraying', 'Transport']
const banners = [
  { tag: 'BOOK BY THE HOUR OR DAY', title: 'The right machine for every season.', body: 'Compare local farm equipment, see clear rental prices and reserve when the work calls.', color: 'green', icon: Tractor },
  { tag: 'GROW MORE. WAIT LESS.', title: 'Harvest on your schedule.', body: 'Find harvesters and tractors from owners serving your area.', color: 'gold', icon: Sprout },
  { tag: 'LOCAL EQUIPMENT OWNERS', title: 'Reliable tools, close to home.', body: 'Browse real listings with photos, specifications and rental terms.', color: 'blue', icon: Truck },
]
function matchesCategory(item: RentalEquipment, category: string) {
  if (category === 'All equipment') return true
  const text = `${item.equipment_type} ${item.name}`.toLowerCase()
  const patterns: Record<string, RegExp> = { Tractors: /tractor|power tiller/, Harvesters: /harvest|combine|thresher/, Tillage: /rotavator|cultivator|plough|plow|tiller|harrow/, Planting: /seed|planter|transplanter/, Irrigation: /irrigat|pump|sprinkler/, Spraying: /spray|sprayer|duster/, Transport: /trailer|cart|tractor trolley|transport/ }
  return patterns[category]?.test(text) ?? false
}
function ListingCard({ item, userId, onBook, onDetails, onCart, onCartError }: { item: RentalEquipment; userId: string; onBook: (item: RentalEquipment) => void; onDetails: (item: RentalEquipment) => void; onCart: (item: RentalEquipment) => void; onCartError: (message: string) => void }) {
  const [saved, setSaved] = useState(false)
  const originalHour = rentalRate(item, 'hour', false), hourPrice = rentalRate(item, 'hour')
  const originalDay = rentalRate(item, 'day', false), dayPrice = rentalRate(item, 'day')
  const discount = rentalDiscountPercent(item)
  async function cart(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation(); setSaved(false)
    try { await addToCart(userId, item.id); setSaved(true); onCart(item) } catch (reason) { setSaved(false); onCartError(reason instanceof Error ? reason.message : 'Could not update your cart.') }
  }
  function keyOpen(event: KeyboardEvent<HTMLElement>) { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onDetails(item) } }
  return <article className="rental-card" role="link" tabIndex={0} aria-label={`View ${item.name} rental details`} onClick={() => onDetails(item)} onKeyDown={keyOpen}>
    <div className="rental-card-cover">{item.photos[0] ? <img src={item.photos[0]} alt={item.name} loading="lazy" /> : <div className="rental-card-fallback"><Tractor size={42} /></div>}{!item.is_available&&<span className="rental-out-of-stock-badge">Out of Stock</span>}{discount > 0 && <span className="rental-discount-badge"><BadgePercent size={13} /> {discount}% OFF</span>}<span className="rental-photo-count">{item.photos.length || 1} photos</span></div>
      <div className="rental-card-info"><span className="rental-card-category">{item.equipment_type}</span><h2>{item.name}</h2><p className="rental-card-spec">{[item.brand, item.model, item.equipment_capacity || item.fuel_type].filter(Boolean).join(' · ') || item.equipment_condition || 'Farm ready'}</p>
      <div className="rental-owner"><span className="rental-owner-avatar">{item.owner_avatar ? <img src={item.owner_avatar} alt="" /> : item.owner_name.charAt(0)}</span><span>Rented by <b>{item.owner_name}</b></span><span className="rental-rating">{item.rating ? <>{item.rating.toFixed(1)} <Star size={12} fill="currentColor" /></> : 'New'} <small>({item.review_count})</small></span></div>
      <div className="rental-price-pair"><div><span>Per hour</span><strong>{hourPrice ? money(hourPrice) : '—'}</strong>{hourPrice < originalHour && <del>{money(originalHour)}</del>}</div><div><span>Per day</span><strong>{dayPrice ? money(dayPrice) : '—'}</strong>{dayPrice < originalDay && <del>{money(originalDay)}</del>}</div></div>
      <div className="rental-card-location"><MapPin size={13} />{item.service_area || item.location || 'Service area not specified'}</div>
      <div className="rental-card-actions"><button type="button" className="rental-add-cart" disabled={!item.is_available} onClick={(event) => void cart(event)}>{saved ? <Check size={16} /> : <ShoppingCart size={16} />}{!item.is_available?'Out of Stock':saved ? 'Added' : 'Add to Cart'}</button><button type="button" className="rental-book-now" disabled={!item.is_available} onClick={(event) => { event.stopPropagation(); onBook(item) }}>{item.is_available?'Book Now':'Unavailable'}</button></div>
    </div>
  </article>
}

export default function ExploreHome() {
  const { userId, profile } = useOutletContext<AppContextValue>()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [listings, setListings] = useState<RentalEquipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(params.get('q') || '')
  const [category, setCategory] = useState('All equipment')
  const [banner, setBanner] = useState(0)
  const [notice, setNotice] = useState('')
  useEffect(() => { setQuery(params.get('q') || '') }, [params])
  useEffect(() => { let active = true; void getRentals().then((rows) => { if (active) { setListings(rows); setError('') } }).catch((reason: unknown) => { if (active) { const detail = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : JSON.stringify(reason); setError(detail && detail !== '{}' ? `Could not load equipment listings: ${detail}` : 'Could not load equipment listings. Check your Supabase connection and listing access.') } }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [userId])
  useEffect(() => { const timer = window.setInterval(() => setBanner((current) => (current + 1) % banners.length), 7000); return () => window.clearInterval(timer) }, [])
  const filtered = useMemo(() => listings.filter((item) => matchesCategory(item, category) && (!query.trim() || `${item.name} ${item.equipment_type} ${item.description ?? ''} ${item.brand ?? ''} ${item.model ?? ''} ${item.location ?? ''}`.toLowerCase().includes(query.toLowerCase()))), [category, listings, query])
  const promo = banners[banner], PromoIcon = promo.icon
  return <main className="farmer-explore rental-marketplace" style={{ '--fx-accent': '#126b43', '--fx-deep': '#0b3d2c', '--fx-canvas': '#f4f7f2' } as CSSProperties}>
    <div className="fx-content rental-content">
      <section className={`rental-promo rental-promo-${promo.color}`} aria-label="Equipment rental promotions"><div className="rental-promo-copy"><span>{promo.tag}</span><h1>{promo.title}</h1><p>{promo.body}</p><a href="#rental-listings" onClick={(event) => { event.preventDefault(); document.getElementById('rental-listings')?.scrollIntoView({ behavior: 'smooth' }) }}>Explore equipment <ChevronRight size={16} /></a></div><span className="rental-promo-art"><PromoIcon size={96} strokeWidth={1.2} /></span><div className="rental-promo-controls"><button aria-label="Previous promotion" onClick={() => setBanner((banner + banners.length - 1) % banners.length)}><ChevronLeft size={17} /></button>{banners.map((item, index) => <button key={item.tag} aria-label={`Show promotion ${index + 1}`} className={index === banner ? 'is-active' : ''} onClick={() => setBanner(index)} />)}<button aria-label="Next promotion" onClick={() => setBanner((banner + 1) % banners.length)}><ChevronRight size={17} /></button></div></section>
      <section className="rental-benefits"><span><ShieldCheck size={18} /> Verified rental listings</span><span><PackageCheck size={18} /> Clear prices &amp; terms</span><span><CalendarDays size={18} /> Choose your rental dates</span></section>
      <section className="rental-category-section"><div className="rental-section-heading"><div><span className="fx-kicker">FIND THE RIGHT MACHINE</span><h2>Equipment categories</h2></div></div><div className="rental-category-pills" role="group" aria-label="Filter equipment category">{categories.map((label) => <button key={label} type="button" className={category === label ? 'selected' : ''} onClick={() => setCategory(label)}>{label === 'All equipment' && <Tractor size={15} />}{label}</button>)}</div></section>
      <div className="rental-list-heading" id="rental-listings"><div><span className="fx-kicker">EQUIPMENT FOR YOUR FARM</span><h2>{category === 'All equipment' ? 'Available for rent' : category}</h2><p>{profile?.village ? `Equipment near ${profile.village}` : 'Compare equipment listed by local owners'}</p></div><label className="rental-inline-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search equipment" aria-label="Filter equipment" /></label></div>
      {notice && <div className="rental-notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}{error && <div className="fx-error" role="alert">{error}</div>}
      {loading ? <div className="rental-loading"><span className="spinner" /> Loading available equipment…</div> : filtered.length ? <div className="rental-grid">{filtered.map((item) => <ListingCard key={item.id} item={item} userId={userId} onDetails={(selected) => navigate(`/farmer/equipment/${selected.id}`)} onBook={(selected) => navigate(`/farmer/checkout?equipment=${encodeURIComponent(selected.id)}`)} onCart={(selected) => setNotice(`${selected.name} added to your rental cart.`)} onCartError={setNotice} />)}</div> : <div className="rental-empty"><Tractor size={32} /><h3>{query || category !== 'All equipment' ? 'No matching equipment' : 'No available listings yet'}</h3><p>Try another category or search term. New active listings from equipment owners appear here.</p></div>}
      <footer className="rental-trust-footer"><Link to="/farmer/bookings">My rentals</Link><Link to="/farmer/farms">My farm</Link><span>Equipment rentals made for local farming</span></footer>
    </div>
  </main>
}
