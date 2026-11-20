import { useEffect, useState } from 'react'
import { ArrowRight, Bell, CircleHelp, MapPin, Package, Sprout } from 'lucide-react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { requireSupabase } from '../../../lib/supabase'
import type { AppContextValue } from '../../../types/user'
import ExploreSettings, { type ExploreSections } from './ExploreSettings'
import './FarmerUtilityPage.css'

interface Order { id: string; order_number: string; status: string; created_at: string }
export default function FarmerUtilityPage() {
  const { userId } = useOutletContext<AppContextValue>()
  const { pathname } = useLocation()
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState('')
  const [sections, setSections] = useState<ExploreSections | null>(null)
  const isDelivery = pathname.endsWith('/delivery')
  const isSettings = pathname.endsWith('/settings')
  useEffect(() => {
    if (!isDelivery) return
    let active = true
    void (async () => {
      try {
        const { data, error: resultError } = await requireSupabase().from('orders').select('id,order_number,status,created_at').eq('farmer_id', userId).order('created_at', { ascending: false }).limit(50)
        if (!active) return
        if (resultError) setError(resultError.message); else setOrders((data ?? []) as Order[])
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Could not load delivery orders.') }
    })()
    return () => { active = false }
  }, [isDelivery, userId])
  if (isSettings) return <main className="farmer-utility"><span className="fx-kicker">FARMER WORKSPACE</span><h1>Settings</h1><p>Manage what appears in your Explore marketplace.</p><ExploreSettings onChange={setSections} /><Link to="/profile-setup" className="fu-link"><MapPin size={17} /> Update profile and farm location <ArrowRight size={16} /></Link>{sections && <p className="fu-note">Your Explore layout preferences are saved in this browser.</p>}</main>
  if (isDelivery) return <main className="farmer-utility"><span className="fx-kicker">FARMER WORKSPACE</span><h1>Delivery tracking</h1><p>Delivery progress for orders linked to your farmer account.</p>{error && <div className="fx-error" role="alert">{error}</div>}{orders.length ? <div className="fu-orders">{orders.map((order) => <article key={order.id}><span><Package size={18} /></span><div><strong>{order.order_number}</strong><small>Placed {new Date(order.created_at).toLocaleDateString()}</small></div><em>{order.status.replaceAll('_', ' ')}</em></article>)}</div> : !error && <div className="fx-empty"><Package size={22} /><span>No delivery orders are available yet.</span><Link to="/farmer/orders">View orders</Link></div>}</main>
  return <main className="farmer-utility"><span className="fx-kicker">FARMER WORKSPACE</span><h1>Farmer support</h1><p>Quick links to the tools that can help you move forward.</p><div className="fu-help-grid"><Link to="/farmer/farms"><MapPin size={20} /><span><strong>Farm profile</strong><small>Update your farm location and details.</small></span><ArrowRight size={16} /></Link><Link to="/farmer/products"><Sprout size={20} /><span><strong>Product listings</strong><small>Manage produce, pricing and stock.</small></span><ArrowRight size={16} /></Link><Link to="/notifications"><Bell size={20} /><span><strong>Notifications</strong><small>Review account activity notices.</small></span><ArrowRight size={16} /></Link><Link to="/farmer/settings"><CircleHelp size={20} /><span><strong>Explore settings</strong><small>Choose which marketplace sections to show.</small></span><ArrowRight size={16} /></Link></div></main>
}
