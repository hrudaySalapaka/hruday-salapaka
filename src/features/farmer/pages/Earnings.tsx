import { useEffect, useMemo, useState } from 'react'
import { BadgeIndianRupee, Wallet } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { requireSupabase } from '../../../lib/supabase'
import type { AppContextValue } from '../../../types/user'
import '../styles/FarmerDataPages.css'
interface Payment { id: string; payer_id: string | null; amount: number; currency: string; status: string; created_at: string }
export default function Earnings() {
  const { userId } = useOutletContext<AppContextValue>()
  const [rows, setRows] = useState<Payment[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true)
  useEffect(() => { let active = true; void (async () => { try { const { data, error: resultError } = await requireSupabase().from('payments').select('id,payer_id,amount,currency,status,created_at').eq('payee_id', userId).order('created_at', { ascending: false }).limit(100); if (resultError) throw resultError; if (active) setRows((data ?? []) as Payment[]) } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Could not load payment records.') } finally { if (active) setLoading(false) } })(); return () => { active = false } }, [userId])
  const paid = useMemo(() => rows.filter((row) => row.status === 'paid').reduce((sum, row) => sum + Number(row.amount || 0), 0), [rows])
  const money = (amount: number, currency = 'INR') => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount) || 0)
  return <main className="farmer-data-page"><header><div><span className="fx-kicker">FARMER WORKSPACE</span><h1>Earnings &amp; wallet</h1><p>Payment records received by your farmer account.</p></div><Link to="/farmer/wallet">Wallet view</Link></header><div className="farmer-earnings-total"><Wallet size={21} /><div><small>Paid records total</small><strong>{money(paid)}</strong></div></div>{error && <div className="fx-error" role="alert">{error}</div>}{loading ? <p>Loading payments…</p> : rows.length ? <div className="farmer-data-list">{rows.map((row) => <article className="farmer-data-card" key={row.id}><span><BadgeIndianRupee size={19} /></span><div><h2>{money(row.amount, row.currency)}</h2><p>Received {new Date(row.created_at).toLocaleString()}</p></div><em>{row.status.replaceAll('_', ' ')}</em></article>)}</div> : !error && <div className="fx-empty"><BadgeIndianRupee size={22} /><span>No payment records are available yet.</span></div>}</main>
}
