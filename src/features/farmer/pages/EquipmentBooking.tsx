import { useEffect, useState, type FormEvent } from 'react'
import { MapPin, Tractor } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { requireSupabase } from '../../../lib/supabase'
import type { AppContextValue } from '../../../types/user'
import '../styles/FarmerDataPages.css'

interface Equipment { id: string; owner_id: string; name: string; equipment_type: string; description: string | null; pricing_model: string | null; price_per_unit: number; location: string | null; image_url: string | null }
export default function EquipmentBooking() {
  const { userId } = useOutletContext<AppContextValue>()
  const [items, setItems] = useState<Equipment[]>([])
  const [selected, setSelected] = useState<Equipment | null>(null)
  const [start, setStart] = useState(''); const [end, setEnd] = useState('')
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false)
  const [error, setError] = useState(''); const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    void (async () => { try { const { data, error: resultError } = await requireSupabase().from('equipment').select('id,owner_id,name,equipment_type,description,pricing_model,price_per_unit,location,image_url').eq('is_available', true).order('created_at', { ascending: false }).limit(60); if (resultError) throw resultError; if (active) setItems((data ?? []) as Equipment[]) } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Could not load available equipment.') } finally { if (active) setLoading(false) } })()
    return () => { active = false }
  }, [])
  async function requestBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return
    const from = new Date(start); const to = new Date(end)
    if (!start || !end || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) { setError('Choose a booking end time after the start time.'); return }
    const model = (selected.pricing_model || 'day').toLowerCase()
    const unitMs = model.includes('hour') ? 3_600_000 : 86_400_000
    const units = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / unitMs))
    setSaving(true); setError(''); setMessage('')
    try {
      const { error: resultError } = await requireSupabase().from('equipment_bookings').insert({ equipment_id: selected.id, renter_id: userId, owner_id: selected.owner_id, booking_start: from.toISOString(), booking_end: to.toISOString(), total_amount: Number(selected.price_per_unit) * units })
      if (resultError) throw resultError
      setMessage(`Booking request sent for ${selected.name}.`); setSelected(null); setStart(''); setEnd('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not request this equipment.') }
    finally { setSaving(false) }
  }
  const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(amount) || 0)
  return <main className="farmer-data-page"><header><div><span className="fx-kicker">FARMER WORKSPACE</span><h1>Equipment rental</h1><p>Find available machinery and send a request to its owner.</p></div><Link to="/farmer/bookings">My bookings</Link></header>{error && <div className="fx-error" role="alert">{error}</div>}{message && <div className="farmer-data-success" role="status">{message}</div>}{loading ? <p>Loading available equipment…</p> : items.length ? <div className="farmer-equipment-list">{items.map((item) => <article key={item.id}>{item.image_url ? <img src={item.image_url} alt={item.name} /> : <div className="farmer-equipment-placeholder"><Tractor size={28} /></div>}<div><span>{item.equipment_type} · {item.pricing_model || 'per unit'}</span><h2>{item.name}</h2><p>{item.description || 'Equipment listing from a KHETIGO owner.'}</p><small><MapPin size={13} />{item.location || 'Location not specified'}</small><strong>{money(item.price_per_unit)} <small>/ {item.pricing_model || 'unit'}</small></strong></div><button type="button" className="button button-primary" onClick={() => { setSelected(item); setError(''); setMessage('') }}>Request booking</button></article>)}</div> : !error && <div className="fx-empty"><Tractor size={24} /><span>No available equipment listings yet.</span></div>}{selected && <form className="farmer-data-form" onSubmit={(event) => void requestBooking(event)}><div><h2>Book {selected.name}</h2><button type="button" onClick={() => setSelected(null)}>Cancel</button></div><label>Start date and time<input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required /></label><label>End date and time<input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} required /></label><p>Estimated charge is calculated from the listed equipment rate. The owner must confirm your request.</p><button className="button button-primary" disabled={saving}>{saving ? 'Sending request…' : 'Send booking request'}</button></form>}</main>
}
