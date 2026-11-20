import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { ArrowLeft, BadgeCheck, BadgeIndianRupee, Check, ImagePlus, LoaderCircle, PackagePlus, Save, Upload, X, Eye, MapPin } from 'lucide-react'
import { Link, useNavigate, useParams, useOutletContext } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import { equipmentService } from './equipmentService'
import { discountedPrice, formatINR } from './equipmentPricing'
import type { EquipmentDraft, EquipmentPhoto, OwnerEquipment } from './equipmentTypes'
import './EquipmentOwnerEquipment.css'

interface FormValues {
  name: string; equipment_type: string; brand: string; model: string; manufacturing_year: string; description: string
  price_per_hour: string; price_per_day: string; discount_type: 'none' | 'percentage' | 'amount'; discount_value: string
  equipment_capacity: string; fuel_type: string; equipment_condition: string; security_deposit: string; additional_charges: string; operator_available: boolean; terms_and_conditions: string
  state: string; district: string; village: string; pickup_location: string; service_area: string; max_delivery_distance_km: string
  is_available: boolean; available_from: string; available_until: string; operating_hours: string; delivery_available: boolean; pickup_available: boolean
}

const EMPTY_VALUES: FormValues = { name: '', equipment_type: '', brand: '', model: '', manufacturing_year: '', description: '', price_per_hour: '', price_per_day: '', discount_type: 'none', discount_value: '', equipment_capacity: '', fuel_type: '', equipment_condition: '', security_deposit: '0', additional_charges: '0', operator_available: false, terms_and_conditions: '', state: '', district: '', village: '', pickup_location: '', service_area: '', max_delivery_distance_km: '', is_available: true, available_from: '', available_until: '', operating_hours: '', delivery_available: false, pickup_available: true }

const SPEC_FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  Tractor: [{ key: 'horsepower', label: 'Horsepower (HP)', type: 'number' }, { key: 'fuel_type', label: 'Fuel type' }, { key: 'engine_capacity_cc', label: 'Engine capacity (CC)', type: 'number' }, { key: 'transmission_type', label: 'Transmission type' }],
  Harvester: [{ key: 'harvesting_capacity', label: 'Harvesting capacity' }, { key: 'crop_type', label: 'Crop type' }, { key: 'cutting_width', label: 'Cutting width (m)', type: 'number' }],
  Rotavator: [{ key: 'working_width', label: 'Working width (m)', type: 'number' }, { key: 'blade_count', label: 'Number of blades', type: 'number' }, { key: 'required_horsepower', label: 'Required horsepower', type: 'number' }],
  Sprayer: [{ key: 'tank_capacity', label: 'Tank capacity (L)', type: 'number' }, { key: 'spraying_width', label: 'Spraying width (m)', type: 'number' }, { key: 'power_source', label: 'Power source' }],
  Seeder: [{ key: 'row_count', label: 'Number of rows', type: 'number' }, { key: 'working_width', label: 'Working width (m)', type: 'number' }, { key: 'seed_types', label: 'Suitable seed types' }],
  Other: [{ key: 'power_or_capacity', label: 'Power / capacity' }, { key: 'fuel_type', label: 'Fuel or power source' }, { key: 'operating_weight', label: 'Operating weight (kg)', type: 'number' }],
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function saveErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') {
    const message = reason.message
    if (/column .* does not exist|schema cache/i.test(message)) {
      return 'The equipment listing database is missing required fields. Apply the latest Supabase equipment migrations, then try again.'
    }
    if (/row-level security|permission denied|not allowed/i.test(message)) {
      return 'Your account cannot save this listing. Confirm your profile role is Equipment Owner and the equipment owner policies are installed.'
    }
    return message
  }
  return 'Could not save this equipment listing.'
}

export default function EquipmentForm() {
  const { userId } = useOutletContext<AppContextValue>()
  const { equipmentId } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(equipmentId)
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [specifications, setSpecifications] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<EquipmentPhoto[]>([])
  const [existing, setExisting] = useState<OwnerEquipment | null>(null)
  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<{ finished: number; total: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewUrls = useRef(new Set<string>())

  useEffect(() => () => { previewUrls.current.forEach((url) => URL.revokeObjectURL(url)); previewUrls.current.clear() }, [])

  useEffect(() => {
    if (!equipmentId) return
    let active = true
    void equipmentService.get(userId, equipmentId).then((item) => {
      if (!active) return
      setExisting(item)
      const legacyHourlyPrice = item.price_per_hour ?? (/hour/i.test(item.pricing_model ?? '') ? item.price_per_unit : '')
      const legacyDailyPrice = item.price_per_day ?? (/day/i.test(item.pricing_model ?? '') ? item.price_per_unit : '')
      setValues({
        name: item.name, equipment_type: item.equipment_type, brand: item.brand ?? '', model: item.model ?? '', manufacturing_year: item.manufacturing_year ? String(item.manufacturing_year) : '', description: item.description ?? '',
        price_per_hour: String(legacyHourlyPrice), price_per_day: String(legacyDailyPrice), discount_type: item.discount_type ?? 'none',
        discount_value: item.discount_type === 'percentage' ? String(item.discount_percentage ?? '') : item.discount_type === 'amount' ? String(item.discount_amount ?? '') : '',
        equipment_capacity: item.equipment_capacity ?? '', fuel_type: item.fuel_type ?? '', equipment_condition: item.equipment_condition ?? '', security_deposit: String(item.security_deposit ?? 0), additional_charges: String(item.additional_charges ?? 0), operator_available: item.operator_available ?? false, terms_and_conditions: item.terms_and_conditions ?? '',
        state: item.state ?? '', district: item.district ?? '', village: item.village ?? '', pickup_location: item.pickup_location ?? item.location ?? '', service_area: item.service_area ?? '', max_delivery_distance_km: item.max_delivery_distance_km === null ? '' : String(item.max_delivery_distance_km),
        is_available: item.is_available, available_from: item.available_from ?? '', available_until: item.available_until ?? '', operating_hours: item.operating_hours ?? '', delivery_available: item.delivery_available ?? false, pickup_available: item.pickup_available ?? true,
      })
      setSpecifications(item.specifications ?? {})
      setPhotos(item.photos.map((photo) => ({ ...photo })))
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load equipment details.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [equipmentId, userId])

  const specFields = SPEC_FIELDS[values.equipment_type] ?? SPEC_FIELDS.Other
  const hourly = Number(values.price_per_hour) || 0
  const daily = Number(values.price_per_day) || 0
  const discountValue = Number(values.discount_value) || 0
  const finalHourly = discountedPrice(hourly, values.discount_type, values.discount_type === 'percentage' ? discountValue : null, values.discount_type === 'amount' ? discountValue : null)
  const finalDaily = discountedPrice(daily, values.discount_type, values.discount_type === 'percentage' ? discountValue : null, values.discount_type === 'amount' ? discountValue : null)
  const photoCountLabel = useMemo(() => `${photos.length} of 10 photos selected`, [photos.length])

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) { setValues((current) => ({ ...current, [key]: value })) }

  function addFiles(fileList: FileList | File[]) {
    setError('')
    const files = Array.from(fileList)
    const accepted: EquipmentPhoto[] = []
    const problems: string[] = []
    for (const file of files) {
      const extensionAllowed = /\.(jpe?g|png|webp)$/i.test(file.name)
      if (!ALLOWED_TYPES.includes(file.type) && !(file.type === '' && extensionAllowed)) { problems.push(`${file.name}: use JPEG, PNG, or WEBP.`); continue }
      if (file.size > MAX_PHOTO_BYTES) { problems.push(`${file.name}: maximum photo size is 5 MB.`); continue }
      if (photos.length + accepted.length >= 10) { problems.push('You can add up to 10 photos.'); break }
      const imageUrl = URL.createObjectURL(file)
      previewUrls.current.add(imageUrl)
      accepted.push({ file, image_url: imageUrl, is_primary: photos.length === 0 && accepted.length === 0, sort_order: photos.length + accepted.length })
    }
    if (accepted.length) setPhotos((current) => [...current, ...accepted])
    if (problems.length) setError(problems.join(' '))
    if (fileRef.current) fileRef.current.value = ''
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      const removed = current[index]
      if (removed?.file && previewUrls.current.has(removed.image_url)) { URL.revokeObjectURL(removed.image_url); previewUrls.current.delete(removed.image_url) }
      const next = current.filter((_, photoIndex) => photoIndex !== index).map((photo, sort_order) => ({ ...photo, sort_order }))
      if (removed?.is_primary && next[0]) next[0] = { ...next[0], is_primary: true }
      return next
    })
  }

  function setPrimary(index: number) { setPhotos((current) => current.map((photo, photoIndex) => ({ ...photo, is_primary: photoIndex === index }))) }

  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files) }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { if (event.target.files?.length) addFiles(event.target.files) }

  function validate(mode: 'draft' | 'active' = 'active'): EquipmentDraft | null {
    if (!values.name.trim()) { setError('Enter an equipment name.'); return null }
    if (!values.equipment_type) { setError('Choose an equipment category.'); return null }
    if (mode === 'active') {
      if (!hourly || hourly <= 0 || !Number.isFinite(hourly)) { setError('Enter a valid positive hourly price.'); return null }
      if (!daily || daily <= 0 || !Number.isFinite(daily)) { setError('Enter a valid positive daily price.'); return null }
      if (!values.state.trim() || !values.district.trim() || !values.village.trim() || !values.pickup_location.trim() || !values.service_area.trim()) { setError('Complete the state, district, village, pickup location, and service area.'); return null }
      if (!values.max_delivery_distance_km || Number(values.max_delivery_distance_km) <= 0) { setError('Enter a maximum delivery distance greater than zero.'); return null }
      if (!values.available_from || !values.available_until || values.available_until < values.available_from) { setError('Choose an availability end date on or after the start date.'); return null }
      if (!photos.length) { setError('Add at least one equipment photo and choose a cover image.'); return null }
    }
    if (values.discount_type === 'percentage' && (discountValue < 0 || discountValue > 100 || (!discountValue && mode === 'active'))) { setError('Discount percentage must be between 0 and 100.'); return null }
    if (values.discount_type === 'amount' && (discountValue < 0 || (mode === 'active' && discountValue >= Math.min(hourly, daily)))) { setError('Discount amount must be less than both rental prices.'); return null }
    for (const [label, amount] of [['Security deposit', values.security_deposit], ['Additional charges', values.additional_charges]] as const) if (amount && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) { setError(`${label} must be zero or a positive amount.`); return null }
    if (values.manufacturing_year && (Number(values.manufacturing_year) < 1900 || Number(values.manufacturing_year) > new Date().getFullYear())) { setError('Enter a valid manufacturing year.'); return null }
    return {
      ...values,
      name: values.name.trim(), description: values.description.trim(),
      manufacturing_year: values.manufacturing_year ? Number(values.manufacturing_year) : null,
      price_per_hour: hourly, price_per_day: daily,
      discount_percentage: values.discount_type === 'percentage' ? discountValue : null,
      discount_amount: values.discount_type === 'amount' ? discountValue : null,
      equipment_capacity: values.equipment_capacity.trim(), fuel_type: values.fuel_type, equipment_condition: values.equipment_condition,
      security_deposit: Number(values.security_deposit) || 0, additional_charges: Number(values.additional_charges) || 0,
      operator_available: values.operator_available, terms_and_conditions: values.terms_and_conditions.trim(),
      max_delivery_distance_km: Number(values.max_delivery_distance_km),
      specifications: Object.fromEntries(Object.entries(specifications).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value)),
      photos: photos.map((photo, sort_order) => ({ ...photo, sort_order })),
    }
  }

  async function submit(mode: 'draft' | 'active') {
    if (saving) return
    setError('')
    const draft = validate(mode)
    if (!draft) return
    setSaving(true)
    const newPhotoCount = draft.photos.filter((photo) => photo.file).length
    setUploadProgress(newPhotoCount ? { finished: 0, total: newPhotoCount } : null)
    try {
      await equipmentService.save(userId, draft, existing, (finished, total) => setUploadProgress({ finished, total }), mode)
      const action = mode === 'draft' ? 'draft saved' : editing ? 'listing updated' : 'equipment added'
      navigate('/equipment-owner/equipment', { state: { equipmentNotice: `Equipment ${action} successfully.` } })
    } catch (reason) { setError(saveErrorMessage(reason)) }
    finally { setSaving(false); setUploadProgress(null) }
  }

  if (loading) return <main className="owner-equipment-page"><div className="owner-equipment-loading"><span className="owner-equipment-spinner" /> Loading equipment…</div></main>
  if (editing && !existing) return <main className="owner-equipment-page"><Link to="/equipment-owner/equipment" className="owner-equipment-back"><ArrowLeft size={16} /> Back to My Equipment</Link><div className="owner-equipment-error" role="alert">{error || 'This equipment could not be found.'}</div></main>

  return <main className="owner-equipment-page">
    <Link to="/equipment-owner/equipment" className="owner-equipment-back"><ArrowLeft size={16} /> Back to My Equipment</Link>
    <header className="owner-form-heading"><span className="owner-form-heading-icon"><TractorGlyph /></span><div><span className="owner-equipment-eyebrow">EQUIPMENT OWNER WORKSPACE</span><h1>{editing ? 'Edit Equipment' : 'Add Equipment'}</h1><p>{editing ? 'Update the listing details, photos, rates, and availability.' : 'Register your machine so nearby farmers can find and book it.'}</p></div></header>
    {error && <div className="owner-equipment-error" role="alert">{error}</div>}
    <form className="owner-equipment-form" onSubmit={(event) => event.preventDefault()} noValidate>
      <section className="owner-form-section"><div className="owner-form-section-heading"><span>01</span><div><h2>Basic information</h2><p>Identify your equipment and describe its condition.</p></div></div><div className="owner-form-grid"><label className="owner-field owner-field-wide">Equipment name <b>*</b><input value={values.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Mahindra 575 DI tractor" required /></label><label className="owner-field">Equipment category <b>*</b><select value={values.equipment_type} onChange={(event) => { update('equipment_type', event.target.value); setSpecifications({}) }} required><option value="">Select category</option>{['Tractor','Harvester','Rotavator','Sprayer','Seeder','Tiller','Trailer','Other'].map((name) => <option key={name}>{name}</option>)}</select></label><label className="owner-field">Brand<input value={values.brand} onChange={(event) => update('brand', event.target.value)} placeholder="e.g. Mahindra" /></label><label className="owner-field">Model<input value={values.model} onChange={(event) => update('model', event.target.value)} placeholder="e.g. 575 DI" /></label><label className="owner-field">Manufacturing year<input type="number" min="1900" max={new Date().getFullYear()} value={values.manufacturing_year} onChange={(event) => update('manufacturing_year', event.target.value)} placeholder="e.g. 2022" /></label><label className="owner-field owner-field-wide">Equipment description<textarea rows={4} value={values.description} onChange={(event) => update('description', event.target.value)} placeholder="Tell farmers about the machine, condition, and included attachments." /></label></div></section>
      <section className="owner-form-section"><div className="owner-form-section-heading"><span>02</span><div><h2>Equipment specifications</h2><p>Fields adjust based on the selected equipment category.</p></div></div><div className="owner-form-grid"><label className="owner-field">Equipment capacity<input value={values.equipment_capacity} onChange={(event) => update('equipment_capacity', event.target.value)} placeholder="e.g. 4 tonnes per hour" /></label><label className="owner-field">Fuel type<select value={values.fuel_type} onChange={(event) => update('fuel_type', event.target.value)}><option value="">Select fuel type</option>{['Diesel','Petrol','Electric','Hybrid','Other'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="owner-field">Equipment condition<select value={values.equipment_condition} onChange={(event) => update('equipment_condition', event.target.value)}><option value="">Select condition</option>{['New','Excellent','Good','Fair','Needs repair'].map((value) => <option key={value}>{value}</option>)}</select></label>{specFields.map((field) => <label className="owner-field" key={field.key}>{field.label}<input type={field.type ?? 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} value={specifications[field.key] ?? ''} onChange={(event) => setSpecifications((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.type === 'number' ? 'Enter value' : 'Enter details'} /></label>)}</div></section>
      <section className="owner-form-section"><div className="owner-form-section-heading"><span>03</span><div><h2>Pricing details</h2><p>Set clear rental rates and an optional discount.</p></div></div><div className="owner-form-grid"><label className="owner-field">Price per hour (₹) <b>*</b><input type="number" min="0.01" step="0.01" inputMode="decimal" value={values.price_per_hour} onChange={(event) => update('price_per_hour', event.target.value)} placeholder="750" required /></label><label className="owner-field">Price per day (₹) <b>*</b><input type="number" min="0.01" step="0.01" inputMode="decimal" value={values.price_per_day} onChange={(event) => update('price_per_day', event.target.value)} placeholder="5,000" required /></label><label className="owner-field">Discount type<select value={values.discount_type} onChange={(event) => update('discount_type', event.target.value as FormValues['discount_type'])}><option value="none">No discount</option><option value="percentage">Percentage off</option><option value="amount">Flat amount off (₹)</option></select></label>{values.discount_type !== 'none' && <label className="owner-field">{values.discount_type === 'percentage' ? 'Discount percentage (%)' : 'Discount amount (₹)'}<input type="number" min="0" max={values.discount_type === 'percentage' ? 100 : undefined} step="0.01" inputMode="decimal" value={values.discount_value} onChange={(event) => update('discount_value', event.target.value)} placeholder={values.discount_type === 'percentage' ? '10' : '500'} required /></label>}<div className="owner-price-preview owner-field-wide"><span><BadgeIndianRupee size={17} /> Final rates after discount</span><strong>{formatINR(finalHourly)} <small>/ hour</small></strong><strong>{formatINR(finalDaily)} <small>/ day</small></strong></div><label className="owner-field">Security deposit (?)<input type="number" min="0" step="0.01" inputMode="decimal" value={values.security_deposit} onChange={(event) => update('security_deposit', event.target.value)} /></label><label className="owner-field">Additional charges (?)<input type="number" min="0" step="0.01" inputMode="decimal" value={values.additional_charges} onChange={(event) => update('additional_charges', event.target.value)} /></label></div></section>
      <section className="owner-form-section"><div className="owner-form-section-heading"><span>04</span><div><h2>Location and service area</h2><p>Tell renters where equipment can be collected or delivered.</p></div></div><div className="owner-form-grid"><label className="owner-field">State <b>*</b><input value={values.state} onChange={(event) => update('state', event.target.value)} placeholder="State" required /></label><label className="owner-field">District <b>*</b><input value={values.district} onChange={(event) => update('district', event.target.value)} placeholder="District" required /></label><label className="owner-field">Village / city <b>*</b><input value={values.village} onChange={(event) => update('village', event.target.value)} placeholder="Village or city" required /></label><label className="owner-field owner-field-wide">Pickup location <b>*</b><input value={values.pickup_location} onChange={(event) => update('pickup_location', event.target.value)} placeholder="Landmark, yard, or pickup address" required /></label><label className="owner-field">Service area <b>*</b><input value={values.service_area} onChange={(event) => update('service_area', event.target.value)} placeholder="e.g. Nearby villages, 25 km radius" required /></label><label className="owner-field">Maximum delivery distance (km) <b>*</b><input type="number" min="0.1" step="0.1" value={values.max_delivery_distance_km} onChange={(event) => update('max_delivery_distance_km', event.target.value)} placeholder="25" required /></label></div></section>
      <section className="owner-form-section"><div className="owner-form-section-heading"><span>05</span><div><h2>Equipment photos</h2><p>Add up to 10 clear images. The cover image appears in search and listings.</p></div></div><div className={`owner-photo-dropzone${dragging ? ' is-dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }} onDrop={(event) => { setDragging(false); onDrop(event) }}><input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={onFileChange} hidden /><span className="owner-photo-drop-icon"><ImagePlus size={24} /></span><strong>Drag your equipment photos here</strong><small>JPEG, JPG, PNG, or WEBP · up to 5 MB each · {photoCountLabel}</small><button type="button" className="owner-photo-browse" onClick={() => fileRef.current?.click()}><Upload size={15} /> Browse files</button></div>{photos.length > 0 && <div className="owner-photo-preview-grid">{photos.map((photo, index) => <article className={`owner-photo-preview${photo.is_primary ? ' is-primary' : ''}`} key={photo.id ?? photo.storage_path ?? photo.image_url}><img src={photo.image_url} alt={`Equipment photo ${index + 1}`} /><div className="owner-photo-preview-actions"><button type="button" className={photo.is_primary ? 'cover-selected' : ''} onClick={() => setPrimary(index)}>{photo.is_primary ? <><BadgeCheck size={14} /> Cover image</> : 'Set as cover'}</button><button type="button" className="remove-photo" aria-label={`Remove photo ${index + 1}`} onClick={() => removePhoto(index)}><X size={15} /></button></div></article>)}</div>}{uploadProgress && <div className="owner-upload-progress" role="status"><LoaderCircle size={16} className="spinning" /> Uploading photos {uploadProgress.finished} of {uploadProgress.total}<div><span style={{ width: `${uploadProgress.total ? uploadProgress.finished / uploadProgress.total * 100 : 0}%` }} /></div></div>}</section>
      <section className="owner-form-section"><div className="owner-form-section-heading"><span>06</span><div><h2>Additional information</h2><p>Add optional services and renter instructions.</p></div></div><div className="owner-form-grid"><label className="owner-field">Operator available<select value={values.operator_available ? 'yes' : 'no'} onChange={(event) => update('operator_available', event.target.value === 'yes')}><option value="no">No</option><option value="yes">Yes</option></select></label><label className="owner-field owner-field-wide">Terms and conditions<textarea rows={3} value={values.terms_and_conditions} onChange={(event) => update('terms_and_conditions', event.target.value)} placeholder="Add booking or equipment use conditions for renters." /></label></div></section>
      <section className="owner-form-section"><div className="owner-form-section-heading"><span>07</span><div><h2>Availability</h2><p>Set the dates and handoff options renters can request.</p></div></div><div className="owner-form-grid"><label className="owner-field">Listing status<select value={values.is_available ? 'available' : 'unavailable'} onChange={(event) => update('is_available', event.target.value === 'available')}><option value="available">Available</option><option value="unavailable">Unavailable</option></select></label><label className="owner-field">Available from <b>*</b><input type="date" value={values.available_from} onChange={(event) => update('available_from', event.target.value)} required /></label><label className="owner-field">Available until <b>*</b><input type="date" min={values.available_from || undefined} value={values.available_until} onChange={(event) => update('available_until', event.target.value)} required /></label><label className="owner-field">Operating hours<input value={values.operating_hours} onChange={(event) => update('operating_hours', event.target.value)} placeholder="e.g. 7:00 AM – 6:00 PM" /></label><div className="owner-form-checks owner-field-wide"><label><input type="checkbox" checked={values.delivery_available} onChange={(event) => update('delivery_available', event.target.checked)} /><span><strong>Delivery available</strong><small>Owner can deliver within the listed service distance.</small></span></label><label><input type="checkbox" checked={values.pickup_available} onChange={(event) => update('pickup_available', event.target.checked)} /><span><strong>Pickup available</strong><small>Renter can collect equipment at the pickup location.</small></span></label></div></div></section>





      <footer className="owner-form-footer"><Link to="/equipment-owner/equipment" className="owner-form-cancel">Cancel</Link><button type="button" className="owner-form-cancel" disabled={saving} onClick={() => setPreviewOpen(true)}><Eye size={16} /> Preview Equipment</button><button type="button" className="owner-form-cancel" disabled={saving} onClick={() => void submit('draft')}><Save size={16} /> Save as Draft</button><button type="button" className="owner-equipment-primary" disabled={saving} onClick={() => void submit('active')}>{saving ? <><LoaderCircle size={16} className="spinning" /> Saving?</> : editing ? <><Save size={16} /> Submit Changes</> : <><Check size={17} /> Submit Equipment</>}</button></footer>
    </form>
    {previewOpen && <div className="owner-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewOpen(false) }}><section className="owner-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="owner-preview-title"><button type="button" className="owner-preview-close" aria-label="Close preview" onClick={() => setPreviewOpen(false)}><X size={18} /></button><span className="owner-equipment-eyebrow">LISTING PREVIEW</span><h2 id="owner-preview-title">{values.name || 'Your equipment'}</h2><p>{[values.brand, values.model, values.equipment_type].filter(Boolean).join(' ? ') || 'Equipment category and model'}</p>{photos[0] && <img className="owner-preview-photo" src={photos.find((photo) => photo.is_primary)?.image_url ?? photos[0].image_url} alt="Equipment preview" />}<div className="owner-preview-rates"><strong>{formatINR(finalHourly)} <small>/ hour</small></strong><strong>{formatINR(finalDaily)} <small>/ day</small></strong></div><p>{values.description || 'Equipment description will appear here.'}</p><p><MapPin size={15} /> {[values.village, values.district, values.state].filter(Boolean).join(', ') || 'Location not added yet'}</p><button type="button" className="owner-equipment-primary" onClick={() => setPreviewOpen(false)}>Close preview</button></section></div>}
  </main>
}

function TractorGlyph() { return <PackagePlus size={22} /> }
