import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, BadgeIndianRupee, Bell, CalendarDays, Check, Clock3, Settings, MapPin, PackagePlus, Sprout, Tractor, Wheat } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { requireSupabase } from '../../lib/supabase'
import type { AppContextValue } from '../../types/user'
import RentalRequests from './RentalRequests'
import './EquipmentOwnerDashboard.css'

type Equipment = { id: string; name: string; equipment_type: string | null; location: string | null; is_available: boolean | null; image_url: string | null; price_per_unit: number | null; pricing_model: string | null }
type Booking = { id: string; status: string; booking_start: string; total_amount: number; equipment?: { name?: string; equipment_type?: string } | null }
const money = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const categories = [
  { name: 'Tractors', icon: Tractor, type: 'tractor' }, { name: 'Harvesters', icon: Wheat, type: 'harvester' },
  { name: 'Tillers', icon: Settings, type: 'tiller' }, { name: 'Other equipment', icon: PackagePlus, type: '' },
]

export default function EquipmentOwnerDashboard(props: { path: string }) {
  const { userId, profile } = useOutletContext<AppContextValue>()
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [earned, setEarned] = useState(0)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const db = requireSupabase()
      const [equipmentResult, bookingResult, paymentResult] = await Promise.all([
        db.from('equipment').select('id,name,equipment_type,location,is_available,image_url,price_per_unit,pricing_model').eq('owner_id', userId).order('created_at', { ascending: false }).limit(8),
        db.from('equipment_bookings').select('id,status,booking_start,total_amount,equipment(name,equipment_type)').eq('owner_id', userId).order('created_at', { ascending: false }).limit(8),
        db.from('equipment_booking_payments').select('amount,status,equipment_bookings!inner(owner_id)').eq('equipment_bookings.owner_id', userId),
      ])
      if (equipmentResult.error) throw equipmentResult.error
      if (bookingResult.error) throw bookingResult.error
      setEquipment((equipmentResult.data ?? []) as unknown as Equipment[])
      const nextBookings = (bookingResult.data ?? []) as unknown as Booking[]
      setBookings(nextBookings)
      setPending(nextBookings.filter((booking) => booking.status === 'waiting_owner_approval').length)
      setEarned(((paymentResult.data ?? []) as { amount: number; status: string }[]).filter((payment) => payment.status === 'paid' || payment.status === 'admin_verified').reduce((sum, payment) => sum + Number(payment.amount || 0), 0))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your dashboard.') }
    finally { setLoading(false) }
  }, [userId])
  useEffect(() => { void load() }, [load])
  if (props.path === '/equipment-owner/requests') return <RentalRequests />

  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'there'
  const location = [profile?.village, profile?.district].filter(Boolean).join(', ') || 'Set your location'
  const active = bookings.filter((booking) => booking.status === 'confirmed').length
  const stats = [
    { label: 'My equipment', value: String(equipment.length), note: `${equipment.filter((item) => item.is_available).length} available to rent`, icon: Tractor, tone: 'green', to: '/equipment-owner/equipment' },
    { label: 'Rental requests', value: String(pending), note: 'Waiting for your response', icon: Clock3, tone: 'amber', to: '/equipment-owner/requests' },
    { label: 'Active bookings', value: String(active), note: 'Confirmed rentals', icon: CalendarDays, tone: 'blue', to: '/equipment-owner/requests' },
    { label: 'Total earnings', value: money(earned), note: 'From completed payments', icon: BadgeIndianRupee, tone: 'purple', to: '/equipment-owner/earnings' },
  ]
  return <main className="owner-dashboard">
    <header className="owner-mobile-brand"><Link to="/home"><span className="owner-brand-mark"><Sprout size={20}/></span><span><b>KHETIGO</b><small>Smart Farm Connect</small></span></Link><Link to="/notifications" aria-label="Notifications"><Bell size={20}/></Link></header>
    <div className="owner-location"><MapPin size={15}/><span>{location}</span><span className="location-dot"/></div>
    <section className="owner-welcome"><div><span className="owner-overline">EQUIPMENT OWNER DASHBOARD</span><h1>Good morning, {firstName} <span>✦</span></h1><p>Your equipment is helping farms get more done. Here’s your business at a glance.</p></div><Link className="owner-add-button" to="/equipment-owner/equipment/add"><PackagePlus size={18}/> List equipment</Link></section>
    {error && <div className="owner-error" role="alert">{error}<button onClick={() => void load()}>Retry</button></div>}
    <section className="owner-stats" aria-label="Dashboard statistics">{stats.map(({ label, value, note, icon: Icon, tone, to }) => <Link className="owner-stat" to={to} key={label}><span className={`owner-stat-icon ${tone}`}><Icon size={20}/></span><span className="owner-stat-label">{label}</span><strong>{loading ? '—' : value}</strong><small>{note}</small><ArrowRight className="owner-stat-arrow" size={16}/></Link>)}</section>
    <div className="owner-content-grid"><div className="owner-main-column">
      <section className="owner-section"><div className="owner-section-head"><div><span className="owner-overline">GROW YOUR REACH</span><h2>Equipment categories</h2></div><Link to="/equipment-owner/equipment">View all <ArrowRight size={15}/></Link></div><div className="owner-categories">{categories.map(({ name, icon: Icon, type }) => <Link to="/equipment-owner/equipment" className="owner-category" key={name}><span><Icon size={23}/></span><b>{name}</b><small>{type ? equipment.filter((item) => (item.equipment_type || '').toLowerCase().includes(type)).length : equipment.length} listed</small></Link>)}</div></section>
      <section className="owner-section"><div className="owner-section-head"><div><span className="owner-overline">YOUR FLEET</span><h2>My equipment</h2></div><Link to="/equipment-owner/equipment">Manage equipment <ArrowRight size={15}/></Link></div>{loading ? <div className="owner-empty">Loading your equipment…</div> : equipment.length ? <div className="owner-equipment-grid">{equipment.slice(0, 4).map((item) => <Link to={`/equipment-owner/equipment/${item.id}`} className="owner-equipment-card" key={item.id}><div className="owner-equipment-image">{item.image_url ? <img src={item.image_url} alt=""/> : <Tractor size={33}/>}<span className={item.is_available ? 'available' : 'unavailable'}>{item.is_available ? 'Available' : 'Rented'}</span></div><div className="owner-equipment-info"><small>{item.equipment_type || 'Farm equipment'}</small><b>{item.name}</b><span>{item.location || location}</span><strong>{money(Number(item.price_per_unit || 0))}<small> / {item.pricing_model || 'day'}</small></strong></div></Link>)}</div> : <Link to="/equipment-owner/equipment/add" className="owner-empty owner-empty-link"><span><PackagePlus size={20}/></span><b>Your equipment will appear here</b><small>Add your first listing to start receiving rental requests.</small></Link>}</section>
    </div><aside className="owner-side-column"><section className="owner-section owner-request-panel"><div className="owner-section-head"><div><span className="owner-overline">NEEDS YOUR ATTENTION</span><h2>Rental requests</h2></div><Link to="/equipment-owner/requests">See all <ArrowRight size={15}/></Link></div>{loading ? <div className="owner-empty">Loading requests…</div> : bookings.filter((booking) => booking.status === 'waiting_owner_approval').length ? bookings.filter((booking) => booking.status === 'waiting_owner_approval').slice(0, 3).map((booking) => <Link className="owner-request-row" to="/equipment-owner/requests" key={booking.id}><span className="request-avatar"><Tractor size={17}/></span><span><b>{booking.equipment?.name || 'Equipment rental'}</b><small>{new Date(booking.booking_start).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · Pending review</small></span><ArrowRight size={16}/></Link>) : <div className="owner-empty owner-no-requests"><Check size={21}/><b>You’re all caught up</b><small>New rental requests will show up here.</small></div>}</section>
      <Link to="/equipment-owner/earnings" className="owner-earnings-card"><span><BadgeIndianRupee size={18}/> EARNINGS OVERVIEW</span><b>{loading ? '—' : money(earned)}</b><small>Payments received from rentals</small><i>View earnings <ArrowRight size={15}/></i></Link>
      <Link to="/equipment-owner/requests" className="owner-bookings-link"><span><CalendarDays size={19}/></span><span><b>Bookings & rental history</b><small>{active} active booking{active === 1 ? '' : 's'}</small></span><ArrowRight size={17}/></Link>
    </aside></div>
    <footer className="owner-footer"><Sprout size={15}/> Growing together with KHETIGO</footer>
  </main>
}

