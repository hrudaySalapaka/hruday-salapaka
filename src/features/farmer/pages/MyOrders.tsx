import { useEffect, useState } from 'react'
import { ShoppingBag } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { requireSupabase } from '../../../lib/supabase'
import type { AppContextValue } from '../../../types/user'
import '../styles/FarmerDataPages.css'
interface Order { id: string; order_number: string; status: string; total_amount: number; currency: string; created_at: string }
export default function MyOrders() {
  const { userId } = useOutletContext<AppContextValue>()
  const [rows, setRows] = useState<Order[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  useEffect(() => { let active = true; void (async () => { try { const { data, error: resultError } = await requireSupabase().from('orders').select('id,order_number,status,total_amount,currency,created_at').eq('farmer_id', userId).order('created_at', { ascending: false }).limit(100); if (resultError) throw resultError; if (active) setRows((data ?? []) as Order[]) } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Could not load orders.') } finally { if (active) setLoading(false) } })(); return () => { active = false } }, [userId])
  return <main className="farmer-data-page"><header><div><span className="fx-kicker">FARMER WORKSPACE</span><h1>Orders</h1><p>Orders assigned to your farmer account.</p></div><Link to="/farmer/delivery">Delivery tracking</Link></header>{error && <div className="fx-error" role="alert">{error}</div>}{loading ? <p>Loading orders…</p> : rows.length ? <div className="farmer-data-list">{rows.map((row) => <article className="farmer-data-card" key={row.id}><span><ShoppingBag size={19} /></span><div><h2>{row.order_number}</h2><p>Placed {new Date(row.created_at).toLocaleDateString()}</p><small>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: row.currency || 'INR', maximumFractionDigits: 2 }).format(Number(row.total_amount) || 0)}</small></div><em>{row.status.replaceAll('_', ' ')}</em></article>)}</div> : !error && <div className="fx-empty"><ShoppingBag size={22} /><span>No orders available for your account yet.</span></div>}</main>
}
