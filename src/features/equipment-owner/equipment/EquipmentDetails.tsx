import { useEffect, useState } from 'react'
import { ArrowLeft, BadgeIndianRupee, CalendarDays, Check, Clock3, MapPin, Pencil, Tractor, Truck, UserRound, X } from 'lucide-react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import { equipmentService } from './equipmentService'
import { discountedPrice, formatINR } from './equipmentPricing'
import type { OwnerEquipment } from './equipmentTypes'
import './EquipmentOwnerEquipment.css'

export default function EquipmentDetails() {
  const { userId } = useOutletContext<AppContextValue>()
  const { equipmentId } = useParams()
  const [item, setItem] = useState<OwnerEquipment | null>(null)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!equipmentId) return
    let active = true
    void equipmentService.get(userId, equipmentId).then((data) => { if (active) setItem(data) }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load equipment details.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [equipmentId, userId])

  if (loading) return <main className="owner-equipment-page"><div className="owner-equipment-loading"><span className="owner-equipment-spinner" /> Loading equipment details…</div></main>
  if (!item) return <main className="owner-equipment-page"><Link to="/equipment-owner/equipment" className="owner-equipment-back"><ArrowLeft size={16} /> Back to My Equipment</Link><div className="owner-equipment-error" role="alert">{error || 'This equipment could not be found.'}</div></main>
  const photos = item.photos.length ? item.photos : item.image_url ? [{ image_url: item.image_url, is_primary: true, sort_order: 0 }] : []
  const selectedPhoto = photos[photoIndex]
  const hourly = item.price_per_hour ?? item.price_per_unit
  const finalHourly = discountedPrice(hourly, item.discount_type ?? 'none', item.discount_percentage, item.discount_amount)
  const finalDaily = item.price_per_day ? discountedPrice(item.price_per_day, item.discount_type ?? 'none', item.discount_percentage, item.discount_amount) : null

  return <main className="owner-equipment-page">
    <Link to="/equipment-owner/equipment" className="owner-equipment-back"><ArrowLeft size={16} /> Back to My Equipment</Link>
    <header className="owner-details-heading"><div><span className="owner-equipment-eyebrow">EQUIPMENT LISTING</span><h1>{item.name}</h1><p>{[item.brand, item.model, item.equipment_type].filter(Boolean).join(' · ')}</p></div><div className="owner-details-heading-actions"><span className={`owner-availability${item.is_available ? ' available' : ' unavailable'}`}><i />{item.is_available ? 'Available' : 'Unavailable'}</span><Link className="owner-equipment-primary" to="edit"><Pencil size={15} /> Edit listing</Link></div></header>
    {error && <div className="owner-equipment-error" role="alert">{error}</div>}
    <div className="owner-equipment-details-layout"><section className="owner-details-gallery"><div className="owner-details-main-photo">{selectedPhoto ? <img src={selectedPhoto.image_url} alt={`${item.name} equipment view`} /> : <div className="owner-equipment-cover-empty"><Tractor size={44} /><span>No equipment photos</span></div>}</div>{photos.length > 1 && <div className="owner-details-thumbnails">{photos.map((photo, index) => <button type="button" key={photo.id ?? photo.storage_path ?? index} className={photoIndex === index ? 'selected' : ''} aria-label={`View photo ${index + 1}`} onClick={() => setPhotoIndex(index)}><img src={photo.image_url} alt="" /></button>)}</div>}</section>
      <section className="owner-details-rate-card"><div className="owner-details-rate-title"><BadgeIndianRupee size={18} /><span>Rental rates</span></div><div className="owner-details-price"><small>Hourly rental</small><strong>{formatINR(finalHourly)} <small>/ hour</small></strong>{item.discount_type !== 'none' && <span>Was {formatINR(hourly)} · {item.discount_type === 'percentage' ? `${item.discount_percentage}% off` : `${formatINR(item.discount_amount)} off`}</span>}</div>{finalDaily !== null && <div className="owner-details-price"><small>Daily rental</small><strong>{formatINR(finalDaily)} <small>/ day</small></strong></div>}<div className="owner-details-rate-facts"><span><CalendarDays size={15} />{item.available_from || 'Start date not set'} – {item.available_until || 'No end date'}</span><span><Clock3 size={15} />{item.operating_hours || 'Operating hours not set'}</span></div></section></div>
    <section className="owner-details-description"><div className="owner-details-section-title"><span className="owner-details-icon"><Tractor size={18} /></span><div><span className="owner-equipment-eyebrow">LISTING INFORMATION</span><h2>About this equipment</h2></div></div><p>{item.description || 'No description added yet.'}</p><div className="owner-details-quick-facts"><div><small>Category</small><strong>{item.equipment_type}</strong></div><div><small>Brand</small><strong>{item.brand || '—'}</strong></div><div><small>Model</small><strong>{item.model || '—'}</strong></div><div><small>Manufacturing year</small><strong>{item.manufacturing_year || '—'}</strong></div></div></section>
    <div className="owner-details-lower-grid"><section className="owner-details-info-card"><div className="owner-details-section-title"><span className="owner-details-icon"><MapPin size={18} /></span><div><span className="owner-equipment-eyebrow">PICKUP & DELIVERY</span><h2>Service area</h2></div></div><dl><dt>Pickup location</dt><dd>{item.pickup_location || item.location || 'Not provided'}</dd><dt>Location</dt><dd>{[item.village, item.district, item.state].filter(Boolean).join(', ') || item.location || 'Not provided'}</dd><dt>Service area</dt><dd>{item.service_area || 'Not provided'}</dd><dt>Maximum distance</dt><dd>{item.max_delivery_distance_km ?? '—'}{item.max_delivery_distance_km !== null ? ' km' : ''}</dd></dl><div className="owner-details-availability-options"><span className={item.delivery_available ? 'enabled' : ''}>{item.delivery_available ? <Check size={15} /> : <X size={15} />}Delivery available</span><span className={item.pickup_available ? 'enabled' : ''}>{item.pickup_available ? <Check size={15} /> : <X size={15} />}Pickup available</span></div></section>
      <section className="owner-details-info-card"><div className="owner-details-section-title"><span className="owner-details-icon"><UserRound size={18} /></span><div><span className="owner-equipment-eyebrow">MACHINE DETAILS</span><h2>Specifications</h2></div></div>{Object.entries(item.specifications ?? {}).length ? <dl className="owner-details-specs">{Object.entries(item.specifications ?? {}).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{value}</dd></div>)}</dl> : <p className="owner-details-no-specs">No specifications have been added.</p>}<div className="owner-details-availability-options"><span><Truck size={15} />Delivery {item.delivery_available ? 'offered' : 'not offered'}</span><span><Check size={15} />Listed since {new Date(item.created_at).toLocaleDateString()}</span></div></section></div>
  </main>
}
