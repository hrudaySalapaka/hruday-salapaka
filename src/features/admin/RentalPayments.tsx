import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BadgeCheck, Banknote, Check, ExternalLink, LoaderCircle, ShieldCheck, X } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import type { AppContextValue } from '../../types/user'
import { requireSupabase } from '../../lib/supabase'
import { money } from '../farmer/services/rentalMarketplace'

type Row = Record<string, any>
type Person = {id:string;full_name:string;phone:string|null}
const sections = [
  ['upi', 'UPI payment requests'], ['verified', 'Verified payments'], ['approval', 'Owner booking approvals'], ['rejected', 'Owner rejected / refunds'],
  ['payout', 'Payout requests'], ['refund', 'Refund requests'], ['refundDone', 'Completed refunds'], ['cod', 'COD bookings'], ['history', 'Payment history'],
] as const
type Section = typeof sections[number][0]
export default function RentalPayments() {
  const { profile } = useOutletContext<AppContextValue>()
  const [rows, setRows] = useState<Row[]>([]), [tab, setTab] = useState<Section>('upi')
  const [people,setPeople]=useState<Map<string,Person>>(new Map())
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [upiId, setUpiId] = useState(''), [receiverName, setReceiverName] = useState('KHETIGO')
  const [charges,setCharges]=useState({farmer:'0',owner:'0',freeTrips:'2',perKm:'0'})
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const client = requireSupabase()
      const [payments, settings, chargeSettings] = await Promise.all([
        client.from('equipment_booking_payments').select('id,booking_id,renter_id,method,amount,status,utr_number,transaction_amount,transaction_at,screenshot_path,verified_at,rejection_reason,payout_status,payout_reference,payout_completed_at,refund_status,refund_reference,refund_completed_at,created_at,equipment_bookings(id,booking_reference,renter_id,owner_id,equipment_id,booking_start,booking_end,total_amount,status,payment_status,equipment(name,image_url))').order('created_at', { ascending: false }).limit(500),
        client.rpc('admin_get_rental_upi_settings'),
        client.rpc('admin_get_rental_charge_settings'),
      ])
      if (payments.error) throw payments.error
      if (settings.error) throw settings.error
      if (chargeSettings.error) throw chargeSettings.error
      const setting = Array.isArray(settings.data) ? settings.data[0] : settings.data
      const charge=Array.isArray(chargeSettings.data)?chargeSettings.data[0]:chargeSettings.data
      const records=(payments.data??[]) as unknown as Row[], ids=[...new Set(records.flatMap(p=>[p.renter_id,p.equipment_bookings?.owner_id]).filter(Boolean))]
      const profiles=ids.length?await client.from('profiles').select('id,full_name,phone').in('id',ids):{data:[],error:null};if(profiles.error)throw profiles.error
      setRows(records);setPeople(new Map(((profiles.data??[]) as Person[]).map(p=>[p.id,p]))); setUpiId(setting?.receiver_upi_id ?? ''); setReceiverName(setting?.receiver_name ?? 'KHETIGO')
      if(charge)setCharges({farmer:String(charge.farmer_base_charge),owner:String(charge.owner_base_charge),freeTrips:String(charge.free_trip_count),perKm:String(charge.per_km_charge)})
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load rental payment requests.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  const visible = rows.filter(p => {
    const b = p.equipment_bookings
    if (!b) return false
    if (tab === 'upi') return p.method === 'upi' && p.status === 'pending_verification'
    if (tab === 'verified') return p.status === 'admin_verified'
    if (tab === 'approval') return b.status === 'waiting_owner_approval'
    if (tab === 'rejected') return b.status === 'refund_pending' || b.status === 'rejected'
    if (tab === 'payout') return p.payout_status === 'pending'
    if (tab === 'refund') return p.refund_status === 'pending'
    if (tab === 'refundDone') return p.refund_status === 'completed'
    if (tab === 'cod') return p.method === 'cod'
    return true
  })
  async function run(id: string, fn: string, args: Record<string, unknown>) {
    setBusy(id); setError(''); setMessage('')
    try { const { error: e } = await requireSupabase().rpc(fn, args); if (e) throw e; setMessage('Payment workflow updated.'); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update this payment.') }
    finally { setBusy('') }
  }
  async function review(payment: Row, accept: boolean) {
    const reason = accept ? null : window.prompt('Reason for rejecting this payment?')
    if (!accept && !reason) return
    await run(payment.id, 'admin_review_rental_upi_payment', { p_payment_id: payment.id, p_accept: accept, p_reason: reason })
  }
  async function settle(payment: Row, type: 'payout' | 'refund') {
    const reference = window.prompt(`Enter the actual ${type} transaction reference after the transfer is completed.`)
    if (!reference) return
    const fn = type === 'payout' ? 'admin_complete_rental_payout' : 'admin_complete_rental_refund'
    await run(payment.id, fn, { p_payment_id: payment.id, p_reference: reference, p_completed_at: new Date().toISOString() })
  }
  async function openProof(path: string) {
    const { data, error: e } = await requireSupabase().storage.from('rental-payment-proofs').createSignedUrl(path, 60)
    if (e) setError(e.message); else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  async function saveSettings(e: FormEvent) {
    e.preventDefault(); setBusy('settings'); setError(''); setMessage('')
    try { const { error: e } = await requireSupabase().rpc('admin_set_rental_upi_settings', { p_receiver_upi_id: upiId.trim(), p_receiver_name: receiverName.trim() }); if (e) throw e; setMessage('UPI receiver settings saved securely.') }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save receiver settings.') }
    finally { setBusy('') }
  }
  async function saveCharges(e:FormEvent){e.preventDefault();setBusy('charges');setError('');setMessage('');try{const {error:e}=await requireSupabase().rpc('admin_set_rental_charge_settings',{p_farmer_base:Number(charges.farmer),p_owner_base:Number(charges.owner),p_free_trips:Number(charges.freeTrips),p_per_km:Number(charges.perKm)});if(e)throw e;setMessage('Rental charge policy saved.')}catch(e){setError(e instanceof Error?e.message:'Could not save rental charges.')}finally{setBusy('')}}
  if (profile?.role !== 'Admin') return <main className="plain-page"><h1>Admin access required</h1></main>
  return <main className="plain-page rental-admin-page"><header className="rental-admin-header"><div><span className="fx-kicker">KHETIGO · RENTAL OPERATIONS</span><h1><ShieldCheck size={26}/> UPI Payment Verification</h1><p>Verify transfers against actual transaction history before accepting proof.</p></div><button className="button button-outline" onClick={() => void load()}><LoaderCircle size={15}/> Refresh</button></header>
    {error && <div className="notice notice-error" role="alert">{error}</div>}{message && <div className="notice notice-success" role="status">{message}</div>}
    <form className="rental-admin-settings" onSubmit={e => void saveSettings(e)}><div><h2>Farmer UPI receiver</h2><p>Configure the Admin registered UPI ID shown at farmer checkout.</p></div><label>Receiver name<input value={receiverName} onChange={e => setReceiverName(e.target.value)} required/></label><label>Receiver UPI ID<input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="admin@bank" required/></label><button disabled={busy === 'settings'}>Save settings</button></form>
    <form className="rental-admin-settings" onSubmit={e=>void saveCharges(e)}><div><h2>Delivery &amp; trip charges</h2><p>Configure first-trip-free threshold and distance rate. Distance quotes require user-authorized GPS or an approved routing source.</p></div><label>Farmer base charge<input type="number" min="0" step="0.01" value={charges.farmer} onChange={e=>setCharges({...charges,farmer:e.target.value})}/></label><label>Owner base charge<input type="number" min="0" step="0.01" value={charges.owner} onChange={e=>setCharges({...charges,owner:e.target.value})}/></label><label>Free farmer trips<input type="number" min="0" step="1" value={charges.freeTrips} onChange={e=>setCharges({...charges,freeTrips:e.target.value})}/></label><label>Per kilometre<input type="number" min="0" step="0.01" value={charges.perKm} onChange={e=>setCharges({...charges,perKm:e.target.value})}/></label><button disabled={busy==='charges'}>Save charge policy</button></form>
    <nav className="rental-admin-tabs">{sections.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}<span>{rows.filter(p => key === 'upi' ? p.status === 'pending_verification' : key === 'verified' ? p.status === 'admin_verified' : key === 'approval' ? p.equipment_bookings?.status === 'waiting_owner_approval' : key === 'rejected' ? ['refund_pending','rejected'].includes(p.equipment_bookings?.status) : key === 'refund' ? p.refund_status === 'pending' : key === 'payout' ? p.payout_status === 'pending' : key === 'refundDone' ? p.refund_status === 'completed' : key === 'cod' ? p.method === 'cod' : true).length}</span></button>)}</nav>
    {loading ? <p>Loading payment records…</p> : visible.length ? <div className="rental-admin-list">{visible.map(p => { const b = p.equipment_bookings || {}, farmer=people.get(p.renter_id),owner=people.get(b.owner_id); const proofPath = p.screenshot_path; return <article className="rental-admin-card" key={p.id}><div className="rental-admin-card-title"><div><small>{b.booking_reference || b.id} · {p.method?.toUpperCase()}</small><h2>{b.equipment?.name || 'Equipment rental'}</h2></div><strong>{money(Number(p.amount))}</strong></div><dl><div><dt>Farmer</dt><dd>{farmer?.full_name||'Farmer'}{farmer?.phone?` · ${farmer.phone}`:''}</dd></div><div><dt>Equipment owner</dt><dd>{owner?.full_name||'Equipment owner'}{owner?.phone?` · ${owner.phone}`:''}</dd></div><div><dt>Booking date</dt><dd>{new Date(p.created_at).toLocaleString()}</dd></div><div><dt>Rental date</dt><dd>{b.booking_start ? new Date(b.booking_start).toLocaleString() : '—'} – {b.booking_end ? new Date(b.booking_end).toLocaleString() : ''}</dd></div><div><dt>Booking status</dt><dd>{String(b.status || '').replaceAll('_', ' ')}</dd></div>{p.utr_number && <div><dt>UTR / reference</dt><dd>{p.utr_number}</dd></div>}{p.transaction_at && <div><dt>Transaction date</dt><dd>{new Date(p.transaction_at).toLocaleString()} · {money(Number(p.transaction_amount))}</dd></div>}</dl>{proofPath && <button className="button button-outline" onClick={() => void openProof(proofPath)}><ExternalLink size={14}/> Open payment proof</button>}
      {tab === 'upi' && <div className="rental-admin-actions"><p>Independently confirm the transfer in the bank or UPI transaction history. A screenshot alone is not verification.</p><button disabled={!!busy} onClick={() => void review(p, true)}><Check size={15}/> Accept payment</button><button className="danger" disabled={!!busy} onClick={() => void review(p, false)}><X size={15}/> Reject payment</button></div>}
      {tab === 'payout' && <div className="rental-admin-actions"><p>Record payout only after the actual owner transfer.</p><button disabled={!!busy} onClick={() => void settle(p, 'payout')}><BadgeCheck size={15}/> Record completed payout</button></div>}
      {tab === 'refund' && <div className="rental-admin-actions"><p>Record refund only after the actual farmer refund.</p><button disabled={!!busy} onClick={() => void settle(p, 'refund')}><BadgeCheck size={15}/> Record completed refund</button></div>}
      {p.method === 'cod' && <div className="rental-admin-actions"><Banknote size={16}/> COD · {p.status === 'paid' ? 'Cash collected' : 'Payment pending'} · {b.status}</div>}
      {p.rejection_reason && <p className="rental-admin-reason">Reason: {p.rejection_reason}</p>}</article> })}</div> : <div className="empty-state"><p>No records in this section.</p></div>}
  </main>
}
