import { useEffect, useMemo, useState } from 'react'
import { Check, Clock3, Eye, LayoutGrid, List, MapPin, PackagePlus, Pencil, Search, Tractor, Trash2, X } from 'lucide-react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import { equipmentService } from './equipmentService'
import { discountedPrice, formatINR } from './equipmentPricing'
import type { OwnerEquipment } from './equipmentTypes'
import './EquipmentOwnerEquipment.css'

type View = 'grid' | 'list'

export default function EquipmentListing() {
  const { userId } = useOutletContext<AppContextValue>()
  const location = useLocation()
  const [items, setItems] = useState<OwnerEquipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [status, setStatus] = useState('All status')
  const [view, setView] = useState<View>('grid')
  const [pendingDelete, setPendingDelete] = useState<OwnerEquipment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState((location.state as { equipmentNotice?: string } | null)?.equipmentNotice ?? '')

  async function load() {
    setLoading(true)
    setError('')
    try { setItems(await equipmentService.list(userId)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your equipment.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [userId])

  const categories = useMemo(() => ['All categories', ...Array.from(new Set(items.map((item) => item.equipment_type).filter(Boolean))).sort()], [items])
  const filtered = useMemo(() => items.filter((item) => {
    const phrase = query.trim().toLowerCase()
    const matchesQuery = !phrase || [item.name, item.equipment_type, item.brand, item.model, item.village, item.district, item.service_area].some((value) => value?.toLowerCase().includes(phrase))
    const matchesCategory = category === 'All categories' || item.equipment_type === category
    const matchesStatus = status === 'All status' || (status === 'Available' ? item.is_available : !item.is_available)
    return matchesQuery && matchesCategory && matchesStatus
  }), [items, query, category, status])
  const activeCount = items.filter((item) => item.is_available).length
  const inactiveCount = items.length - activeCount

  async function deleteEquipment() {
    if (!pendingDelete) return
    setDeleting(true)
    setError('')
    try {
      await equipmentService.remove(userId, pendingDelete)
      setItems((current) => current.filter((item) => item.id !== pendingDelete.id))
      setNotice(`${pendingDelete.name} was deleted.`)
      setPendingDelete(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this equipment.') }
    finally { setDeleting(false) }
  }

  return <main className="owner-equipment-page">
    <div className="owner-equipment-heading"><div><span className="owner-equipment-eyebrow">EQUIPMENT OWNER WORKSPACE</span><h1>My Equipment</h1><p>Manage your rental fleet, pricing, and availability from one place.</p></div><Link className="owner-equipment-primary" to="add"><PackagePlus size={17} /> Add Equipment</Link></div>
    <div className="owner-equipment-stats"><article className="owner-stat-card"><span className="owner-stat-icon all"><Tractor size={18} /></span><div><small>Total equipment</small><strong>{items.length}</strong></div></article><article className="owner-stat-card"><span className="owner-stat-icon active"><Check size={18} /></span><div><small>Active</small><strong>{activeCount}</strong></div></article><article className="owner-stat-card"><span className="owner-stat-icon inactive"><Clock3 size={18} /></span><div><small>Inactive</small><strong>{inactiveCount}</strong></div></article></div>
    {notice && <div className="owner-equipment-notice" role="status"><Check size={17} />{notice}<button type="button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
    {error && <div className="owner-equipment-error" role="alert">{error}</div>}
    <section className="owner-equipment-toolbar" aria-label="Equipment filters"><label className="owner-equipment-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, brand, model or area" aria-label="Search equipment" /></label><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">{categories.map((value) => <option key={value}>{value}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by availability"><option>All status</option><option>Available</option><option>Unavailable</option></select><div className="owner-view-switch" aria-label="Equipment display mode"><button type="button" className={view === 'grid' ? 'selected' : ''} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={17} /></button><button type="button" className={view === 'list' ? 'selected' : ''} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} /></button></div></section>
    {loading ? <div className="owner-equipment-loading" role="status"><span className="owner-equipment-spinner" /> Loading equipment…</div> : error && !items.length ? <div className="owner-equipment-empty filtered"><Tractor size={24} /><h2>Equipment could not be loaded</h2><p>Check the owner equipment database migration and connection, then try again.</p><button type="button" onClick={() => void load()}>Try again</button></div> : filtered.length ? <div className={`owner-equipment-grid${view === 'list' ? ' is-list' : ''}`}>{filtered.map((item) => {
      const cover = item.photos.find((photo) => photo.is_primary)?.image_url ?? item.image_url
      const hourPrice = item.price_per_hour ?? item.price_per_unit
      const dailyPrice = item.price_per_day
      const finalHour = discountedPrice(hourPrice, item.discount_type || 'none', item.discount_percentage, item.discount_amount)
      return <article className="owner-equipment-card" key={item.id}>
        <div className="owner-equipment-cover">{cover ? <img src={cover} alt={item.name} /> : <div className="owner-equipment-cover-empty"><Tractor size={35} /><span>Equipment photo</span></div>}<span className={`owner-availability${item.listing_status === 'draft' ? ' unavailable' : item.is_available ? ' available' : ' unavailable'}`}><i />{item.listing_status === 'draft' ? 'Draft' : item.is_available ? 'Available' : 'Unavailable'}</span><span className="owner-photo-count">{item.photos.length} {item.photos.length === 1 ? 'photo' : 'photos'}</span></div>
        <div className="owner-equipment-card-content"><div className="owner-equipment-card-meta"><span>{item.equipment_type}</span><span className="owner-discount-tag">{item.discount_type === 'percentage' && item.discount_percentage ? `${item.discount_percentage}% off` : item.discount_type === 'amount' && item.discount_amount ? `${formatINR(item.discount_amount)} off` : 'Standard rate'}</span></div><h2>{item.name}</h2><p className="owner-equipment-brand">{[item.brand, item.model].filter(Boolean).join(' · ') || 'Brand and model not added'}</p><div className="owner-equipment-prices"><strong>{formatINR(finalHour)}<small> / hour</small></strong>{dailyPrice && <span>{formatINR(discountedPrice(dailyPrice, item.discount_type || 'none', item.discount_percentage, item.discount_amount))} / day</span>}</div>{(item.price_per_hour || item.discount_type !== 'none') && <small className="owner-price-caption">{item.discount_type !== 'none' ? <>Discounted from <s>{formatINR(hourPrice)}</s> per hour</> : `Daily rate ${dailyPrice ? formatINR(dailyPrice) : 'not set'}`}</small>}<div className="owner-equipment-location"><MapPin size={14} /><span>{item.service_area || [item.village, item.district].filter(Boolean).join(', ') || item.location || 'Service area not set'}</span>{item.max_delivery_distance_km !== null && item.max_delivery_distance_km !== undefined && <b>· {item.max_delivery_distance_km} km</b>}</div><div className="owner-equipment-card-actions"><Link to={item.id} className="owner-card-button view"><Eye size={15} /> View Details</Link><Link to={`${item.id}/edit`} className="owner-card-button edit"><Pencil size={15} /> Edit</Link><button type="button" className="owner-card-delete" aria-label={`Delete ${item.name}`} onClick={() => setPendingDelete(item)}><Trash2 size={16} /></button></div></div>
      </article>
    })}</div> : items.length ? <div className="owner-equipment-empty filtered"><Search size={24} /><h2>No matching equipment</h2><p>Adjust the search or filters to see your equipment.</p><button type="button" onClick={() => { setQuery(''); setCategory('All categories'); setStatus('All status') }}>Clear filters</button></div> : <div className="owner-equipment-empty"><span><Tractor size={27} /></span><h2>Your equipment listings start here</h2><p>Add your first machine to set rental rates, service areas, availability, and photos.</p><Link className="owner-equipment-primary" to="add"><PackagePlus size={17} /> Add your first equipment</Link></div>}
    {pendingDelete && <div className="owner-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setPendingDelete(null) }}><section className="owner-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="owner-delete-title"><span className="owner-delete-icon"><Trash2 size={20} /></span><h2 id="owner-delete-title">Delete {pendingDelete.name}?</h2><p>This will remove the listing and its photos. Equipment with existing bookings cannot be deleted; mark it unavailable instead.</p>{error && <div className="owner-equipment-error" role="alert">{error}</div>}<div><button type="button" className="owner-delete-cancel" disabled={deleting} onClick={() => setPendingDelete(null)}>Cancel</button><button type="button" className="owner-delete-confirm" disabled={deleting} onClick={() => void deleteEquipment()}>{deleting ? 'Deleting…' : 'Delete equipment'}</button></div></section></div>}
  </main>
}
