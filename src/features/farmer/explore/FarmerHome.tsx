import { ArrowRight, BadgeIndianRupee, ClipboardList, MapPin, PackagePlus, Sprout, Tractor } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import './FarmerHome.css'

const links = [
  { label: 'Explore marketplace', detail: 'Browse live products and available equipment.', href: '/farmer/explore', icon: Sprout, primary: true },
  { label: 'My farm', detail: 'Keep your farm location and details together.', href: '/farmer/farms', icon: MapPin },
  { label: 'My crops', detail: 'Review your crop catalogue.', href: '/farmer/crops', icon: Sprout },
  { label: 'Sell products', detail: 'Create a produce listing and manage stock.', href: '/farmer/products', icon: PackagePlus },
  { label: 'Equipment bookings', detail: 'Review requests for rented equipment.', href: '/farmer/bookings', icon: Tractor },
  { label: 'Orders', detail: 'View orders containing your products.', href: '/farmer/orders', icon: ClipboardList },
  { label: 'Earnings', detail: 'Review recorded order payouts.', href: '/farmer/earnings', icon: BadgeIndianRupee },
]

export default function FarmerHome() {
  const { profile } = useOutletContext<AppContextValue>()
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || 'Farmer'
  return <main className="farmer-home"><section className="farmer-home-welcome"><span className="fh-mark"><Sprout size={25} /></span><div><span className="fx-kicker">YOUR FARMER WORKSPACE</span><h1>Welcome back, {firstName}</h1><p>Manage your farm, find equipment and share your harvest.</p></div><Link to="/farmer/explore">Open Explore <ArrowRight size={16} /></Link></section><div className="farmer-home-grid">{links.map(({ label, detail, href, icon: Icon, primary }) => <Link to={href} key={href} className={`farmer-home-card${primary ? ' is-primary' : ''}`}><span className="fh-icon"><Icon size={20} /></span><span><strong>{label}</strong><small>{detail}</small></span><ArrowRight className="fh-arrow" size={16} /></Link>)}</div><p className="farmer-home-location">{profile?.village ? <><MapPin size={15} /> Your location: {[profile.village, profile.district, profile.state].filter(Boolean).join(', ')}</> : 'Add your farm address in your profile to help connect with nearby services.'}</p></main>
}
