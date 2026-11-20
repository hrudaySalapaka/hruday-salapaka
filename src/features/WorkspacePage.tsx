import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, BadgeIndianRupee, Check, Clock3, PackagePlus, Search, ShoppingBag, X } from 'lucide-react'
import { Navigate, useOutletContext } from 'react-router-dom'
import { requireSupabase, isSupabaseConfigured } from '../lib/supabase'
import type { AppContextValue, UserRole } from '../types/user'

export interface WorkspaceProps { path: string; title: string; table: string; roles: UserRole[]; description: string; initialCreating?: boolean }
type Row = Record<string, string | number | boolean | null>
interface Field { name: string; label: string; type?: string; required?: boolean }

const projections: Record<string, string> = {
  farms: 'id,name,location,area_acres,created_at',
  crops: 'id,name,variety,quantity,unit,expected_harvest_at,created_at',
  equipment: 'id,name,description,equipment_type,pricing_model,price_per_unit,location,is_available,is_used,image_url,owner_id,created_at',
  equipment_bookings: 'id,status,booking_start,booking_end,total_amount,equipment_id,created_at',
  products: 'id,name,description,price,currency,unit,stock,image_url,status,created_at',
  orders: 'id,order_number,status,total_amount,currency,created_at',
  cart_items: 'id,product_id,quantity,created_at',
  payments: 'id,amount,currency,status,created_at',
  delivery_jobs: 'id,status,pickup_address,dropoff_address,created_at',
  rides: 'id,vehicle_type,pickup_address,dropoff_address,status,estimated_fare,created_at',
}

const createFields: Partial<Record<string, Field[]>> = {
  farms: [{ name: 'name', label: 'Farm name', required: true }, { name: 'location', label: 'Village or location', required: true }, { name: 'area_acres', label: 'Farm area (acres)', type: 'number' }],
  crops: [{ name: 'name', label: 'Crop name', required: true }, { name: 'variety', label: 'Variety' }, { name: 'quantity', label: 'Available quantity', type: 'number' }, { name: 'unit', label: 'Unit (kg, quintal, tonne)' }],
  equipment: [{ name: 'name', label: 'Equipment name', required: true }, { name: 'equipment_type', label: 'Type (tractor, harvester…)', required: true }, { name: 'description', label: 'Description' }, { name: 'pricing_model', label: 'Pricing (hourly, daily, per-acre)' }, { name: 'price_per_unit', label: 'Price per unit (₹)', type: 'number', required: true }, { name: 'location', label: 'Location' }],
  products: [{ name: 'name', label: 'Product name', required: true }, { name: 'description', label: 'Description' }, { name: 'price', label: 'Price (₹)', type: 'number', required: true }, { name: 'unit', label: 'Unit (kg, bunch, pack)' }, { name: 'stock', label: 'Available stock', type: 'number', required: true }],
}

function formatLabel(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function displayValue(value: Row[string]) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Available' : 'Unavailable'
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value)) return new Date(value).toLocaleDateString()
  return String(value)
}

export function WorkspacePage({ path, title, table, roles, description, initialCreating = false }: WorkspaceProps) {
  const { userId, profile } = useOutletContext<AppContextValue>()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(initialCreating)
  const [saving, setSaving] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [actionId, setActionId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const role = profile?.role
  const fields = createFields[table] ?? []
  const canCreate = role === 'Farmer' && ['farms', 'crops'].includes(table) || role === 'Farmer' && table === 'products' || role === 'Equipment Owner' && ['/equipment-owner/equipment', '/equipment-owner/used'].includes(path) || role === 'Market Seller' && ['/seller/products', '/seller/add-product'].includes(path)
  const ownerColumn = table === 'farms' || table === 'crops' || table === 'equipment' || table === 'products' ? 'owner_id' : table === 'cart_items' ? 'user_id' : table === 'equipment_bookings' ? role === 'Farmer' ? 'renter_id' : 'owner_id' : table === 'orders' ? role === 'Customer' ? 'customer_id' : role === 'Farmer' ? 'farmer_id' : 'seller_id' : table === 'payments' ? 'payee_id' : table === 'delivery_jobs' ? 'partner_id' : table === 'rides' ? role === 'Customer' ? 'rider_id' : 'driver_id' : null

  const load = useCallback(async () => {
    try {
      const client = requireSupabase()
      let request = client.from(table).select(projections[table] ?? 'id,created_at').order('created_at', { ascending: false }).limit(40)
      if (table === 'products' && role === 'Customer') request = request.eq('status', 'active')
      else if (table === 'equipment' && role === 'Farmer') request = request.eq('is_available', true)
      else if (table === 'equipment' && path === '/equipment-owner/used') request = request.eq('is_used', true)
      else if (table === 'delivery_jobs' && path === '/delivery/jobs') request = request.eq('status', 'available')
      else if (ownerColumn) request = request.eq(ownerColumn, userId)
      const { data, error: resultError } = await request
      if (resultError) throw resultError
      setError('')
      setRows((data ?? []) as unknown as Row[])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load this workspace.')
    } finally {
      setLoading(false)
    }
  }, [ownerColumn, path, role, table, userId])

  useEffect(() => {
    let active = true
    const request = window.setTimeout(() => { if (active) void load() }, 0)
    return () => { active = false; window.clearTimeout(request) }
  }, [load])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const client = requireSupabase()
    const channel = client.channel(`workspace:${table}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => { void load() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [load, table, userId])
  const filtered = useMemo(() => rows.filter((row) => !query || Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(query.toLowerCase()))), [query, rows])

  async function createRow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) return
    setSaving(true); setError(''); setMessage('')
    const payload: Record<string, string | number | boolean | null> = { owner_id: userId }
    for (const field of fields) {
      const value = values[field.name]?.trim() ?? ''
      if (field.required && !value) { setError(`Enter ${field.label.toLowerCase()}.`); setSaving(false); return }
      if (value) payload[field.name] = field.type === 'number' ? Number(value) : value
    }
    if (table === 'products') { payload.currency = 'INR'; payload.status = 'active' }
    if (table === 'equipment') { payload.is_available = true; payload.is_used = path === '/equipment-owner/used' }
    try {
      if (photo) {
        if (!photo.type.startsWith('image/') || photo.size > 5 * 1024 * 1024) throw new Error('Choose an image up to 5 MB.')
        const client = requireSupabase()
        const storagePath = `${userId}/${table}/${crypto.randomUUID()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
        const { error: uploadError } = await client.storage.from('catalog-media').upload(storagePath, photo, { contentType: photo.type })
        if (uploadError) throw uploadError
        payload.image_url = client.storage.from('catalog-media').getPublicUrl(storagePath).data.publicUrl
      }
      // `table` is selected at runtime, so Supabase cannot infer one insert shape.
      const { error: resultError } = await requireSupabase().from(table).insert(payload as never)
      if (resultError) throw resultError
      setValues({}); setPhoto(null); setCreating(false); setMessage(`${title} item saved.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this item.')
    } finally { setSaving(false) }
  }

  async function addToCart(productId: string) {
    setActionId(productId); setError(''); setMessage('')
    try {
      const client = requireSupabase()
      const { data: cart, error: cartError } = await client.from('carts').upsert({ user_id: userId }, { onConflict: 'user_id' }).select('id').single()
      if (cartError) throw cartError
      const { error: itemError } = await client.from('cart_items').upsert({ cart_id: cart.id, user_id: userId, product_id: productId, quantity: 1 }, { onConflict: 'cart_id,product_id' })
      if (itemError) throw itemError
      setMessage('Added to your cart.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add this product to your cart.') }
    finally { setActionId(null) }
  }

  async function updateStatus(row: Row, status: string) {
    const id = String(row.id)
    setActionId(id); setError(''); setMessage('')
    const update = table === 'delivery_jobs' ? { partner_id: userId, status } : { status }
    try {
      const { error: resultError } = await requireSupabase().from(table).update(update).eq('id', id)
      if (resultError) throw resultError
      setMessage(`Request ${status}.`)
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this request.') }
    finally { setActionId(null) }
  }

  if (!roles.includes(role as UserRole)) return <Navigate to="/home" replace />

  return <section className="workspace-page"><div className="workspace-page-heading"><div><div className="eyebrow">{profile?.role?.toUpperCase()} WORKSPACE</div><h1>{title}</h1><p>{description}</p></div>{canCreate && <button className="button button-primary" onClick={() => setCreating((open) => !open)}><PackagePlus size={17} /> {creating ? 'Close form' : `Add ${table === 'farms' ? 'farm' : table === 'crops' ? 'crop' : table === 'equipment' ? path.endsWith('/used') ? 'used equipment' : 'equipment' : 'product'}`}</button>}</div>{creating && <form className="create-resource-form" onSubmit={createRow}><h2>Add to {title.toLowerCase()}</h2><div className="form-grid">{fields.map((field) => <label key={field.name}>{field.label}<input type={field.type ?? 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} required={field.required} value={values[field.name] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} /></label>)}</div>{['products', 'equipment'].includes(table) && <label className="upload-field">Product or equipment photo<input type="file" accept="image/*" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /><small>Optional · JPG, PNG or WebP · up to 5 MB</small></label>}<button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></form>}{message && <div className="notice notice-success" role="status">{message}</div>}{error && <div className="notice notice-error" role="alert">{error}</div>}{table === 'products' && role === 'Customer' && <label className="workspace-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search available products" /></label>}{loading ? <div className="workspace-state"><span className="spinner" /> Loading your information…</div> : error && !isSupabaseConfigured ? <div className="workspace-state"><p>Connect Supabase to use this workspace.</p></div> : filtered.length === 0 ? <div className="workspace-state empty-workspace"><span className="empty-workspace-icon">{table === 'payments' ? <BadgeIndianRupee size={25} /> : table === 'orders' ? <ShoppingBag size={25} /> : <Clock3 size={25} />}</span><h2>{query ? 'No matching records' : `No ${title.toLowerCase()} yet`}</h2><p>{query ? 'Try another search.' : canCreate ? 'Add your first record to get started.' : 'When there is activity for your account, it will appear here.'}</p></div> : table === 'products' && role === 'Customer' ? <div className="product-grid">{filtered.map((row) => <article className="product-card" key={String(row.id)}>{row.image_url ? <img src={String(row.image_url)} alt="" /> : <div className="product-placeholder"><ShoppingBag size={27} /></div>}<div className="product-card-content"><span className="product-category">{displayValue(row.unit)}</span><h2>{displayValue(row.name)}</h2><p>{displayValue(row.description)}</p><strong className="product-price">₹{displayValue(row.price)} <small>{displayValue(row.currency)}</small></strong><button className="button button-primary button-wide" onClick={() => void addToCart(String(row.id))} disabled={actionId === String(row.id)}>{actionId === String(row.id) ? 'Adding…' : 'Add to cart'}</button></div></article>)}</div> : <div className="record-list">{filtered.map((row) => <article className="record-card" key={String(row.id)}><div className="record-main"><span className="record-icon"><ShoppingBag size={19} /></span><div><h2>{displayValue(row.name ?? row.order_number ?? row.equipment_type ?? row.vehicle_type ?? `${title} record`)}</h2><p>{Object.entries(row).filter(([key]) => !['id', 'created_at', 'name', 'order_number'].includes(key)).slice(0, 4).map(([key, value]) => `${formatLabel(key)}: ${displayValue(value)}`).join(' · ')}</p></div></div><div className="record-actions"><span className="status-pill">{displayValue(row.status ?? row.is_available)}</span>{table === 'delivery_jobs' && path === '/delivery/jobs' && <button className="button button-primary button-small" disabled={actionId === String(row.id)} onClick={() => void updateStatus(row, 'accepted')}>{actionId === String(row.id) ? 'Saving…' : 'Accept job'}</button>}{table === 'equipment_bookings' && role === 'Equipment Owner' && row.status === 'pending' && <><button className="button button-small button-primary" disabled={actionId === String(row.id)} onClick={() => void updateStatus(row, 'accepted')}><Check size={15} /> Accept</button><button className="button button-small button-outline" disabled={actionId === String(row.id)} onClick={() => void updateStatus(row, 'rejected')}><X size={15} /> Decline</button></>}</div></article>)}</div>}<div className="workspace-footnote"><ArrowUpRight size={14} /> Only data permitted for your account is shown.</div></section>
}
