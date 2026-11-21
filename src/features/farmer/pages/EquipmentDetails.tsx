import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, BadgePercent, CalendarDays, ChevronLeft, ChevronRight, MapPin, PackagePlus, ShieldCheck, Star, Tractor, Truck, UserRound } from 'lucide-react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import ProfileAvatar from '../../../components/ProfileAvatar'
import { requireSupabase } from '../../../lib/supabase'
import { addToCart, getRentals, money, rentalDiscountPercent, rentalRate, type RentalEquipment } from '../services/rentalMarketplace'
import '../styles/RentalMarketplace.css'

interface EquipmentReview { id: string; author_id: string; rating: number; body: string | null; media_urls: string[]; video_url: string | null; created_at: string; author_name: string; author_avatar: string | null }
interface Availability { equipment_id: string; booking_start: string; booking_end: string }
const pretty = (key: string) => key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function EquipmentDetails() {
  const { equipmentId = '' } = useParams()
  const { userId, profile } = useOutletContext<AppContextValue>()
  const navigate = useNavigate()
  const [item, setItem] = useState<RentalEquipment | null>(null)
  const [related, setRelated] = useState<RentalEquipment[]>([])
  const [frequentlyTogether, setFrequentlyTogether] = useState<RentalEquipment[]>([])
  const [reviews, setReviews] = useState<EquipmentReview[]>([])
  const [availability, setAvailability] = useState<Availability[]>([])
  const [canReview, setCanReview] = useState(false)
  const [imageIndex, setImageIndex] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [reviewImages, setReviewImages] = useState<File[]>([])
  const [reviewVideo, setReviewVideo] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const client = requireSupabase()
        const rows = await getRentals()
        const found = rows.find((row) => row.id === equipmentId) ?? null
        const [reviewResult, booked, eligibility, priorReview, paired] = await Promise.all([
          client.from('reviews').select('id,author_id,rating,body,media_urls,video_url,created_at').eq('equipment_id', equipmentId).order('created_at', { ascending: false }).limit(60),
          client.from('equipment_public_availability').select('equipment_id,booking_start,booking_end').eq('equipment_id', equipmentId).order('booking_start'),
          client.from('equipment_bookings').select('id').eq('equipment_id', equipmentId).eq('renter_id', userId).eq('status', 'completed').limit(1),
          client.from('reviews').select('id').eq('equipment_id', equipmentId).eq('author_id', userId).limit(1),
          client.from('equipment_co_rental_frequency').select('equipment_id,paired_equipment_id,rental_count').or(`equipment_id.eq.${equipmentId},paired_equipment_id.eq.${equipmentId}`).order('rental_count', { ascending: false }).limit(8),
        ])
        const reviewRows = reviewResult.error ? [] : reviewResult.data ?? []
        const authorIds = [...new Set(reviewRows.map((row) => row.author_id))]
        const authors = authorIds.length ? await client.from('equipment_review_public_profiles').select('id,full_name,avatar_path').in('id', authorIds) : { data: [], error: null }
        const authorMap = new Map((authors.error ? [] : authors.data ?? []).map((row) => [row.id, row]))
        if (!active) return
        setItem(found)
        setRelated(rows.filter((row) => row.id !== equipmentId && row.equipment_type === found?.equipment_type).slice(0, 4))
        const pairedIds = (paired.error ? [] : paired.data ?? []).map((pair) => pair.equipment_id === equipmentId ? pair.paired_equipment_id : pair.equipment_id)
        setFrequentlyTogether(pairedIds.flatMap((id) => { const match = rows.find((row) => row.id === id); return match ? [match] : [] }).slice(0, 4))
        setAvailability(booked.error ? [] : booked.data ?? [])
        setCanReview(!eligibility.error && !priorReview.error && Boolean(eligibility.data?.length) && !priorReview.data?.length)
        setReviews(reviewRows.map((row) => {
          const author = authorMap.get(row.author_id)
          const avatar = author?.avatar_path ? client.storage.from('avatars').getPublicUrl(author.avatar_path).data.publicUrl : null
          return { ...row, author_name: author?.full_name || 'Farmer', author_avatar: avatar } as EquipmentReview
        }))
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Could not load this equipment listing.') }
    })()
    return () => { active = false }
  }, [equipmentId, userId])
  const photos = useMemo(() => item?.photos ?? [], [item])
  const ratingAverage = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length : item?.rating ?? 0
  const discount = item ? rentalDiscountPercent(item) : 0
  function bookNow() { if (item) navigate(`/farmer/checkout?equipment=${encodeURIComponent(item.id)}${startDate ? `&start=${startDate}` : ''}${endDate ? `&end=${endDate}` : ''}`) }
  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!item || !canReview) return
    setBusy(true); setError(''); setNotice('')
    const client = requireSupabase(), media: string[] = []
    try {
      for (const file of reviewImages) {
        if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) throw new Error('Each photo must be an image smaller than 12 MB.')
        const path = `${userId}/${item.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
        const { error: uploadError } = await client.storage.from('equipment-review-media').upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        media.push(client.storage.from('equipment-review-media').getPublicUrl(path).data.publicUrl)
      }
      let videoUrl: string | null = null
      if (reviewVideo) {
        if (!reviewVideo.type.startsWith('video/') || reviewVideo.size > 50 * 1024 * 1024) throw new Error('The review video must be smaller than 50 MB.')
        const path = `${userId}/${item.id}/${crypto.randomUUID()}-${reviewVideo.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
        const { error: uploadError } = await client.storage.from('equipment-review-media').upload(path, reviewVideo, { contentType: reviewVideo.type })
        if (uploadError) throw uploadError
        videoUrl = client.storage.from('equipment-review-media').getPublicUrl(path).data.publicUrl
      }
      const { error: insertError } = await client.from('reviews').insert({ equipment_id: item.id, author_id: userId, rating, body: reviewText.trim() || null, media_urls: media, video_url: videoUrl })
      if (insertError) throw insertError
      setReviews((current) => [{ id: crypto.randomUUID(), author_id: userId, rating, body: reviewText.trim() || null, media_urls: media, video_url: videoUrl, created_at: new Date().toISOString(), author_name: profile?.full_name || 'Farmer', author_avatar: profile?.avatar_url || null }, ...current])
      setCanReview(false); setReviewText(''); setReviewImages([]); setReviewVideo(null); setNotice('Your rental review has been published.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not submit your review.') }
    finally { setBusy(false) }
  }
  async function saveCart() { if (!item) return; setBusy(true); setError(''); try { await addToCart(userId, item.id); setNotice('Added to your rental cart.') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add this listing to your cart.') } finally { setBusy(false) } }
  if (error && !item) return <main className="rental-page"><div className="rental-error" role="alert">{error}</div><Link to="/farmer/home" className="rental-back-link"><ArrowLeft size={15} /> Back to equipment</Link></main>
  if (!item) return <main className="rental-page"><div className="rental-loading"><span className="spinner" /> Loading listingâ€¦</div></main>
  const hourOriginal = rentalRate(item, 'hour', false), dayOriginal = rentalRate(item, 'day', false), hour = rentalRate(item, 'hour'), day = rentalRate(item, 'day')
  const specs = { Brand: item.brand, Model: item.model, 'Manufacturing year': item.manufacturing_year, Capacity: item.equipment_capacity, 'Fuel type': item.fuel_type, Condition: item.equipment_condition, 'Operator available': item.operator_available ? 'Yes' : 'No', 'Delivery available': item.delivery_available ? 'Yes' : 'No', 'Pickup available': item.pickup_available ? 'Yes' : 'No', Location: item.location, ...(item.specifications ?? {}) }
  return <main className="rental-page rental-detail-page"><Link to="/farmer/home" className="rental-back-link"><ArrowLeft size={15} /> All equipment</Link>{error && <div className="rental-error" role="alert">{error}</div>}{notice && <div className="rental-notice" role="status">{notice}</div>}
    <div className="rental-detail-layout"><section className="rental-gallery"><div className="rental-main-image">{photos[imageIndex] ? <img src={photos[imageIndex]} alt={`${item.name} view ${imageIndex + 1}`} /> : <div className="rental-card-fallback"><Tractor size={70} /></div>}{discount > 0 && <span className="rental-discount-badge"><BadgePercent size={14} /> {discount}% OFF</span>}<button className="rental-gallery-prev" aria-label="Previous photo" onClick={() => setImageIndex((imageIndex + photos.length - 1) % photos.length)}><ChevronLeft size={20} /></button><button className="rental-gallery-next" aria-label="Next photo" onClick={() => setImageIndex((imageIndex + 1) % photos.length)}><ChevronRight size={20} /></button></div><div className="rental-thumbnails">{photos.map((src, index) => <button className={index === imageIndex ? 'active' : ''} key={src} onClick={() => setImageIndex(index)} aria-label={`Show equipment photo ${index + 1}`}><img src={src} alt="" /></button>)}</div></section>
      <section className="rental-detail-summary"><span className="rental-card-category">{item.equipment_type}</span><h1>{item.name}</h1><p className="rental-detail-subtitle">{[item.brand, item.model, item.manufacturing_year].filter(Boolean).join(' Â· ')}</p><div className="rental-detail-ratings">{ratingAverage ? <><b>{ratingAverage.toFixed(1)} <Star size={14} fill="currentColor" /></b><span>{reviews.length || item.review_count} farmer reviews</span></> : <span>No farmer ratings yet</span>}<span>Â·</span><MapPin size={14} /><span>{item.service_area || item.location || 'Local service area'}</span></div><p className="rental-detail-description">{item.description || 'Owner listed agricultural equipment available for rental.'}</p>
        <div className="rental-detail-prices">{hour > 0 && <div><span>Hourly rental</span><strong>{money(hour)} <small>/ hour</small></strong>{hour < hourOriginal && <del>{money(hourOriginal)} / hour</del>}</div>}{day > 0 && <div><span>Daily rental</span><strong>{money(day)} <small>/ day</small></strong>{day < dayOriginal && <del>{money(dayOriginal)} / day</del>}</div>}{discount > 0 && <label>{discount}% OFF</label>}</div>
        <div className="rental-owner-card"><ProfileAvatar className="rental-owner-large-avatar" url={item.owner_avatar} name={item.owner_name} /><div><span>Listed by</span><strong>{item.owner_name}</strong><small>Equipment owner</small></div><ShieldCheck size={20} /></div>
        <div className="rental-availability"><div><CalendarDays size={18} /><div><b>Rental availability</b><small>{item.available_from ? `From ${new Date(item.available_from).toLocaleDateString()}` : 'Select dates to check availability'}{item.available_until ? ` Â· through ${new Date(item.available_until).toLocaleDateString()}` : ''}</small></div></div><div className="rental-date-inputs"><label>Start date<input type="date" min={item.available_from || new Date().toISOString().slice(0, 10)} max={item.available_until || undefined} value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>End date<input type="date" min={startDate || item.available_from || new Date().toISOString().slice(0, 10)} max={item.available_until || undefined} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>{availability.length > 0 && <small className="rental-booked-dates">Booked dates: {availability.map((row) => `${new Date(row.booking_start).toLocaleDateString()}â€“${new Date(row.booking_end).toLocaleDateString()}`).join(' Â· ')}</small>}</div>
        <div className="rental-detail-actions">{item.is_available && item.listing_status === 'active' ? <><button className="rental-add-cart" onClick={() => void saveCart()} disabled={busy}><PackagePlus size={17} /> Add to Cart</button><button className="rental-book-now" onClick={bookNow}><CalendarDays size={17} /> Book Now</button></> : <strong className="rental-unavailable-note">Out of Stock · active rental in progress.</strong>}</div><small className="rental-detail-note"><Truck size={14} /> {item.delivery_available ? 'Delivery available from this owner' : item.pickup_available ? 'Pickup from the listed service area' : 'Confirm service arrangements with the owner'}</small>
      </section></div>
    <section className="rental-spec-panel"><header><span className="fx-kicker">LISTING INFORMATION</span><h2>Specifications &amp; rental terms</h2></header><div className="rental-spec-grid">{Object.entries(specs).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => <div key={key}><span>{pretty(key)}</span><b>{String(value)}</b></div>)}<div><span>Security deposit</span><b>{money(item.security_deposit)}</b></div><div><span>Additional charges</span><b>{money(item.additional_charges)}</b></div></div>{item.terms_and_conditions && <div className="rental-terms"><h3>Rental terms</h3><p>{item.terms_and_conditions}</p></div>}</section>
    <section className="rental-review-section" id="reviews"><header><div><span className="fx-kicker">FARMER EXPERIENCES</span><h2>Ratings &amp; reviews {ratingAverage > 0 && <span className="rental-review-average">{ratingAverage.toFixed(1)} <Star size={16} fill="currentColor" /> Â· {reviews.length}</span>}</h2></div></header>
      {canReview && <form className="rental-review-form" onSubmit={(event) => void submitReview(event)}><h3>Review your completed rental</h3><div className="rental-rating-picker" aria-label="Select a rating">{[1,2,3,4,5].map((value) => <button key={value} type="button" aria-label={`${value} stars`} aria-pressed={rating === value} onClick={() => setRating(value)}><Star size={22} fill={value <= rating ? 'currentColor' : 'none'} /></button>)}</div><textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} placeholder="Share how this equipment worked for your farm (optional)" rows={4} /><div className="rental-review-upload"><label>Photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setReviewImages(Array.from(event.target.files ?? []).slice(0, 8))} /></label><label>Video (optional)<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => setReviewVideo(event.target.files?.[0] ?? null)} /></label></div><button className="rental-primary-button" disabled={busy}>{busy ? 'Publishingâ€¦' : 'Publish review'}</button></form>}
      {reviews.length ? <div className="rental-reviews">{reviews.map((review) => <article className="rental-review-card" key={review.id}><div className="rental-review-author"><ProfileAvatar className="rental-review-avatar" url={review.author_avatar} name={review.author_name} /><div><b>{review.author_name}</b><small>{new Date(review.created_at).toLocaleDateString()}</small></div><span>{review.rating} <Star size={13} fill="currentColor" /></span></div>{review.body && <p>{review.body}</p>}{review.media_urls?.length > 0 && <div className="rental-review-gallery">{review.media_urls.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer"><img src={src} alt="Farmer submitted equipment review" loading="lazy" /></a>)}</div>}{review.video_url && <video className="rental-review-video" src={review.video_url} controls preload="metadata" />}</article>)}</div> : <div className="rental-empty compact"><UserRound size={24} /><span>No reviews for this equipment yet.</span></div>}
    </section>
    {related.length > 0 && <section className="rental-related-section"><header><div><span className="fx-kicker">MORE MACHINES LIKE THIS</span><h2>Similar equipment</h2></div></header><div className="rental-related-grid">{related.map((row) => <Link key={row.id} to={`/farmer/equipment/${row.id}`}><img src={row.photos[0] || ''} alt={row.name} /><span>{row.equipment_type}</span><b>{row.name}</b><strong>{money(rentalRate(row, 'day') || rentalRate(row, 'hour'))} <small>/{rentalRate(row, 'day') ? 'day' : 'hour'}</small></strong></Link>)}</div></section>}
    {frequentlyTogether.length > 0 && <section className="rental-related-section"><header><div><span className="fx-kicker">BASED ON COMPLETED RENTALS</span><h2>Frequently rented together</h2></div></header><div className="rental-related-grid">{frequentlyTogether.map((row) => <Link key={row.id} to={`/farmer/equipment/${row.id}`}><img src={row.photos[0] || ''} alt={row.name} /><span>{row.equipment_type}</span><b>{row.name}</b><strong>{money(rentalRate(row, 'day') || rentalRate(row, 'hour'))} <small>/{rentalRate(row, 'day') ? 'day' : 'hour'}</small></strong></Link>)}</div></section>}
  </main>
}
