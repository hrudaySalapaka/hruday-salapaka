import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowUpRight, BadgeIndianRupee, Clock3, PackagePlus, ShoppingBag, Sprout, Store, Tractor } from 'lucide-react'
import { Link, NavLink, Navigate, useOutletContext } from 'react-router-dom'
import { isSupabaseConfigured, requireSupabase } from '../../lib/supabase'
import type { AppContextValue } from '../../types/user'
import type { WorkspaceProps } from '../WorkspacePage'
import './styles/FarmerDashboard.css'

type FarmerDashboardProps = Omit<WorkspaceProps, 'roles'> & { initialShowProductForm?: boolean }

interface ProductImage { storage_path: string; sort_order: number }
interface ProductRow {
  id: string
  name: string
  description: string | null
  category: string
  price_paise: number
  unit: string
  quantity: number
  status: string
  created_at: string
  product_images?: ProductImage[]
}
interface OrderSummary { id: string; status: string; created_at: string }
interface OrderItem {
  id: string
  order_id: string
  product_name: string
  quantity: number
  unit_price_paise: number
  line_total_paise: number
  orders: OrderSummary | OrderSummary[] | null
}
interface EquipmentRow {
  id: string
  owner_id: string
  name: string
  description: string | null
  category: string
  rate_paise: number
  rate_unit: 'hour' | 'day'
  city: string | null
  state: string | null
  has_operator: boolean
}
interface EquipmentBooking {
  id: string
  equipment_id: string
  starts_at: string
  ends_at: string
  total_paise: number
  status: string
  created_at: string
  equipment: Pick<EquipmentRow, 'name' | 'category' | 'city' | 'state' | 'rate_unit'> | null
}
interface PaymentRow {
  id: string
  order_id: string | null
  amount_paise: number
  status: string
  verified_at: string | null
  created_at: string
}

const sections = [
  { label: 'My farm', href: '/farmer/farms' },
  { label: 'My crops', href: '/farmer/crops' },
  { label: 'My products & sales', href: '/farmer/products' },
  { label: 'Rent farm equipment', href: '/farmer/equipment' },
  { label: 'My equipment bookings', href: '/farmer/bookings' },
  { label: 'My orders', href: '/farmer/orders' },
  { label: 'My earnings', href: '/farmer/earnings' },
]

function formatMoney(paise: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((Number(paise) || 0) / 100)
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function relatedOrder(value: OrderItem['orders']) {
  return Array.isArray(value) ? value[0] ?? null : value
}

function errorText(reason: unknown) {
  if (reason && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') return reason.message
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'
}

function ProductCard({ product, onEdit, onDelete, busy }: { product: ProductRow; onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const imagePath = [...(product.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.storage_path
  const imageUrl = imagePath && isSupabaseConfigured
    ? requireSupabase().storage.from('product-images').getPublicUrl(imagePath).data.publicUrl
    : null
  return (
    <article className="farmer-product-card">
      {imageUrl ? <img className="farmer-product-image" src={imageUrl} alt={product.name} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none' }} /> : <div className="farmer-product-placeholder"><Sprout size={30} /></div>}
      <div className="farmer-product-body">
        <div className="farmer-product-meta"><span>{product.category}</span><span className={`farmer-status status-${product.status}`}>{product.status.replaceAll('_', ' ')}</span></div>
        <h3>{product.name}</h3>
        {product.description && <p>{product.description}</p>}
        <div className="farmer-product-facts"><strong>{formatMoney(product.price_paise)} <small>/ {product.unit}</small></strong><span>Stock: {product.quantity} {product.unit}</span></div>
        <div className="farmer-product-actions"><button type="button" className="button button-outline button-small" onClick={onEdit} disabled={busy}>Edit</button><button type="button" className="button button-outline button-small" onClick={onDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button></div>
      </div>
    </article>
  )
}

export default function FarmerDashboard({ path, title, description, initialShowProductForm = false }: FarmerDashboardProps) {
  const { userId, profile } = useOutletContext<AppContextValue>()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [sales, setSales] = useState<OrderItem[]>([])
  const [equipment, setEquipment] = useState<EquipmentRow[]>([])
  const [bookings, setBookings] = useState<EquipmentBooking[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [membershipActive, setMembershipActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showProductForm, setShowProductForm] = useState(initialShowProductForm)
  const [productImage, setProductImage] = useState<File | null>(null)
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)
  const [bookingEquipment, setBookingEquipment] = useState<EquipmentRow | null>(null)
  const [bookingStart, setBookingStart] = useState('')
  const [bookingEnd, setBookingEnd] = useState('')
  const [productForm, setProductForm] = useState({ name: '', category: '', description: '', price: '', unit: 'kg', quantity: '' })
  const role = profile?.role
  const roleInfo = profile?.role_info ?? {}

  async function loadSection() {
    if (path === '/farmer/farms') {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const client = requireSupabase()
      if (path === '/farmer/products' || path === '/farmer/crops') {
        const productsRequest = client.from('products')
          .select('id,name,description,category,price_paise,unit,quantity,status,created_at,product_images(storage_path,sort_order)')
          .eq('farmer_id', userId)
          .order('created_at', { ascending: false })
          .limit(100)
        const salesRequest = path === '/farmer/products'
          ? client.from('order_items').select('id,order_id,product_name,quantity,unit_price_paise,line_total_paise,orders(id,status,created_at)').eq('farmer_id', userId).limit(100)
          : Promise.resolve({ data: [], error: null })
        const membershipRequest = path === '/farmer/products'
          ? client.from('farmer_memberships').select('id').eq('farmer_id', userId).eq('payment_status', 'verified').gt('expires_at', new Date().toISOString()).limit(1)
          : Promise.resolve({ data: [], error: null })
        const [productResult, salesResult, membershipResult] = await Promise.all([productsRequest, salesRequest, membershipRequest])
        if (productResult.error) throw productResult.error
        if (salesResult.error) throw salesResult.error
        if (membershipResult.error) throw membershipResult.error
        setProducts((productResult.data ?? []) as unknown as ProductRow[])
        setSales((salesResult.data ?? []) as unknown as OrderItem[])
        setMembershipActive(Boolean(membershipResult.data?.length))
      } else if (path === '/farmer/equipment') {
        const { data, error: resultError } = await client.from('equipment')
          .select('id,owner_id,name,description,category,rate_paise,rate_unit,city,state,has_operator')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(60)
        if (resultError) throw resultError
        setEquipment((data ?? []) as unknown as EquipmentRow[])
      } else if (path === '/farmer/bookings') {
        const { data, error: resultError } = await client.from('equipment_bookings')
          .select('id,equipment_id,starts_at,ends_at,total_paise,status,created_at,equipment(name,category,city,state,rate_unit)')
          .eq('renter_id', userId)
          .order('created_at', { ascending: false })
          .limit(100)
        if (resultError) throw resultError
        setBookings((data ?? []) as unknown as EquipmentBooking[])
      } else if (path === '/farmer/orders') {
        const { data, error: resultError } = await client.from('order_items')
          .select('id,order_id,product_name,quantity,unit_price_paise,line_total_paise,orders(id,status,created_at)')
          .eq('farmer_id', userId)
          .limit(100)
        if (resultError) throw resultError
        setSales((data ?? []) as unknown as OrderItem[])
      } else if (path === '/farmer/earnings') {
        const { data, error: resultError } = await client.from('payments')
          .select('id,order_id,membership_id,amount_paise,status,verified_at,created_at')
          .eq('user_id', userId)
          .not('order_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(100)
        if (resultError) throw resultError
        setPayments((data ?? []) as unknown as PaymentRow[])
      }
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const run = async () => {
      if (path === '/farmer/farms') {
        setLoading(false)
        return
      }
      await loadSection()
    }
    if (active) void run()
    return () => { active = false }
    // loadSection captures the current route, profile and user ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, userId])

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!productImage && !editingProduct) return setError('Choose a product photo before saving.')
    const price = Number(productForm.price)
    const quantity = Number(productForm.quantity)
    if (!productForm.name.trim() || !productForm.category.trim() || !productForm.unit.trim()) return setError('Complete the product name, crop category and unit.')
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity < 0) return setError('Enter a valid price and stock quantity.')
    if (productImage && (!productImage.type.startsWith('image/') || productImage.size > 5 * 1024 * 1024)) return setError('Choose an image up to 5 MB.')

    setSaving(true)
    let storagePath: string | null = null
    let productId: string | null = null
    let imageLinked = false
    try {
      const client = requireSupabase()
      if (editingProduct) {
        if (productImage) {
          const extension = productImage.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
          storagePath = `${userId}/${crypto.randomUUID()}.${extension}`
          const { error: uploadError } = await client.storage.from('product-images').upload(storagePath, productImage, { contentType: productImage.type, upsert: false })
          if (uploadError) throw uploadError
          const { error: imageError } = await client.from('product_images').insert({ product_id: editingProduct.id, storage_path: storagePath, sort_order: -1 })
          if (imageError) throw imageError
          imageLinked = true
        }
        const { error: updateError } = await client.from('products').update({ name: productForm.name.trim(), category: productForm.category.trim(), description: productForm.description.trim(), price_paise: Math.round(price * 100), unit: productForm.unit.trim(), quantity }).eq('id', editingProduct.id).eq('farmer_id', userId)
        if (updateError) throw updateError
        setMessage(`Updated ${productForm.name.trim()}.`)
        setEditingProduct(null)
        setProductForm({ name: '', category: '', description: '', price: '', unit: 'kg', quantity: '' })
        setProductImage(null)
        setShowProductForm(false)
        await loadSection()
        return
      }
      if (!productImage) throw new Error('Choose a product photo before saving.')
      const extension = productImage.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      storagePath = `${userId}/${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await client.storage.from('product-images').upload(storagePath, productImage, { contentType: productImage.type, upsert: false })
      if (uploadError) throw uploadError

      const { data: product, error: productError } = await client.from('products').insert({
        farmer_id: userId,
        name: productForm.name.trim(),
        description: productForm.description.trim(),
        category: productForm.category.trim(),
        price_paise: Math.round(price * 100),
        unit: productForm.unit.trim(),
        quantity,
        status: 'draft',
      }).select('id').single()
      if (productError) throw productError
      productId = product.id as string

      const { error: imageError } = await client.from('product_images').insert({ product_id: productId, storage_path: storagePath, sort_order: 0 })
      if (imageError) throw imageError
      imageLinked = true

      if (membershipActive) {
        const { error: publishError } = await client.from('products').update({ status: 'active' }).eq('id', productId).eq('farmer_id', userId)
        if (publishError) throw new Error(`Your product is saved with its photo as a draft, but could not be published: ${publishError.message}`)
      }
      setMessage(membershipActive ? 'Product published and added to your crop catalogue.' : 'Product saved as a draft. An active farmer membership is required to publish it.')
      setProductForm({ name: '', category: '', description: '', price: '', unit: 'kg', quantity: '' })
      setProductImage(null)
      setShowProductForm(false)
      await loadSection()
    } catch (reason) {
      if (storagePath && !imageLinked) await requireSupabase().storage.from('product-images').remove([storagePath]).catch(() => undefined)
      if (productId && !imageLinked) await requireSupabase().from('products').delete().eq('id', productId).eq('farmer_id', userId)
      setError(errorText(reason))
    } finally {
      setSaving(false)
    }
  }

  function editProduct(product: ProductRow) {
    setEditingProduct(product)
    setProductForm({ name: product.name, category: product.category, description: product.description ?? '', price: String(product.price_paise / 100), unit: product.unit, quantity: String(product.quantity) })
    setProductImage(null)
    setError(''); setMessage(''); setShowProductForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteProduct(product: ProductRow) {
    if (!window.confirm(`Delete “${product.name}”? This removes your listing.`)) return
    setDeletingProductId(product.id); setError(''); setMessage('')
    try {
      const client = requireSupabase()
      let photoCleanupFailed = false
      const { error: deleteError } = await client.from('products').delete().eq('id', product.id).eq('farmer_id', userId).select('id').single()
      if (deleteError) throw deleteError
      const paths = (product.product_images ?? []).map((image) => image.storage_path).filter(Boolean)
      if (paths.length) {
        const { error: storageError } = await client.storage.from('product-images').remove(paths)
        photoCleanupFailed = Boolean(storageError)
      }
      setMessage(photoCleanupFailed ? 'Listing deleted. One or more stored photos could not be removed.' : `Deleted ${product.name}.`)
      await loadSection()
    } catch (reason) { setError(errorText(reason)) }
    finally { setDeletingProductId(null) }
  }

  async function requestBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!bookingEquipment) return
    setError('')
    setMessage('')
    const starts = new Date(bookingStart)
    const ends = new Date(bookingEnd)
    if (!bookingStart || !bookingEnd || Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) return setError('Choose a valid booking end time after the start time.')
    const duration = ends.getTime() - starts.getTime()
    const units = Math.max(1, Math.ceil(duration / (bookingEquipment.rate_unit === 'day' ? 86_400_000 : 3_600_000)))
    setSaving(true)
    try {
      const { error: resultError } = await requireSupabase().from('equipment_bookings').insert({
        equipment_id: bookingEquipment.id,
        renter_id: userId,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        total_paise: bookingEquipment.rate_paise * units,
      })
      if (resultError) throw resultError
      setMessage('Booking request sent to the equipment owner.')
      setBookingEquipment(null)
      setBookingStart('')
      setBookingEnd('')
      await loadSection()
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setSaving(false)
    }
  }

  const verifiedEarnings = useMemo(() => payments.filter((payment) => payment.status === 'verified').reduce((total, payment) => total + payment.amount_paise, 0), [payments])
  const activeOrderValue = useMemo(() => sales.reduce((total, item) => {
    const status = relatedOrder(item.orders)?.status
    return status && status !== 'cancelled' && status !== 'pending_payment' ? total + item.line_total_paise : total
  }, 0), [sales])
  if (role !== 'Farmer') return <Navigate to="/home" replace />

  return (
    <section className="workspace-page farmer-dashboard">
      <header className="farmer-dashboard-heading">
        <div>
          <div className="eyebrow">FARMER WORKSPACE</div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="farmer-welcome-chip"><Sprout size={17} /> {profile?.full_name || 'Farmer'}</span>
      </header>

      <nav className="farmer-section-nav" aria-label="Farmer workspace sections">
        {sections.map((section) => <NavLink key={section.href} to={section.href} className={({ isActive }) => `farmer-section-link${isActive ? ' active' : ''}`}>{section.label}</NavLink>)}
      </nav>

      {error && <div className="notice notice-error farmer-notice" role="alert">{error}</div>}
      {message && <div className="notice notice-success farmer-notice" role="status">{message}</div>}

      {path === '/farmer/farms' && (
        <div className="farmer-farm-panel">
          <div className="farmer-farm-icon"><Tractor size={27} /></div>
          <div className="farmer-farm-heading"><span className="farmer-panel-kicker">FARM PROFILE</span><h2>{roleInfo.farm_name || 'Your farm'}</h2><p>Your farm details are stored with your existing profile.</p></div>
          <div className="farmer-farm-facts">
            <div><span>Farm size</span><strong>{roleInfo.farm_size || 'Not added yet'}</strong></div>
            <div><span>Location</span><strong>{[profile?.village, profile?.district, profile?.state].filter(Boolean).join(', ') || 'Not added yet'}</strong></div>
            <div><span>Address</span><strong>{profile?.address || 'Not added yet'}</strong></div>
          </div>
          <div className="farmer-panel-actions"><Link className="button button-primary" to="/profile-setup">Edit farm profile</Link><Link className="farmer-text-link" to="/farmer/crops">View crop listings <ArrowUpRight size={15} /></Link></div>
        </div>
      )}

      {(path === '/farmer/crops' || path === '/farmer/products') && (
        <>
          <div className="farmer-overview-grid">
            <article className="farmer-stat-card"><span className="farmer-stat-icon"><Sprout size={19} /></span><span className="farmer-stat-label">Crop / product listings</span><strong>{products.length}</strong><small>Current listings in your catalogue</small></article>
            {path === '/farmer/products' && <article className="farmer-stat-card"><span className="farmer-stat-icon"><Store size={19} /></span><span className="farmer-stat-label">Order value</span><strong>{formatMoney(activeOrderValue)}</strong><small>Non-cancelled orders linked to your products</small></article>}
            {path === '/farmer/products' && <article className="farmer-stat-card"><span className="farmer-stat-icon"><ShoppingBag size={19} /></span><span className="farmer-stat-label">Sales line items</span><strong>{sales.length}</strong><small>Real order items recorded for your farmer ID</small></article>}
          </div>

          {path === '/farmer/products' && <div className="farmer-membership-note">{membershipActive ? 'Your active farmer membership lets you publish product listings.' : 'Listings can be saved as drafts. An active farmer membership is required by Supabase policy to publish products.'}</div>}

          <div className="farmer-section-title-row">
            <div><h2>{path === '/farmer/crops' ? 'My crop catalogue' : 'My products'}</h2><p>{path === '/farmer/crops' ? 'Crop entries are represented by real produce listings in the existing products table.' : 'Images, pricing, units, stock and publication status for your produce.'}</p></div>
            {path === '/farmer/products' && <button type="button" className="button button-primary" onClick={() => { setShowProductForm((open) => { if (open) { setEditingProduct(null); setProductForm({ name: '', category: '', description: '', price: '', unit: 'kg', quantity: '' }); setProductImage(null) } setError(''); setMessage(''); return !open }) }}><PackagePlus size={17} /> {showProductForm ? 'Close form' : 'Add product'}</button>}
          </div>

          {path === '/farmer/products' && showProductForm && (
            <form className="create-resource-form farmer-product-form" onSubmit={(event) => void createProduct(event)}>
              <h2>{editingProduct ? `Edit ${editingProduct.name}` : 'New crop or produce listing'}</h2>
              <div className="form-grid">
                <label>Product / crop name<input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} required /></label>
                <label>Crop category<input value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} placeholder="e.g. Vegetables, grains, fruit" required /></label>
                <label>Price (₹)<input type="number" inputMode="decimal" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} required /></label>
                <label>Unit<input value={productForm.unit} onChange={(event) => setProductForm((current) => ({ ...current, unit: event.target.value }))} placeholder="kg, bunch, bag" required /></label>
                <label>Available stock<input type="number" inputMode="decimal" min="0" step="any" value={productForm.quantity} onChange={(event) => setProductForm((current) => ({ ...current, quantity: event.target.value }))} required /></label>
                <label>Product photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProductImage(event.target.files?.[0] ?? null)} required={!editingProduct} /><small>{editingProduct ? 'Optional replacement photo · up to 5 MB' : 'JPG, PNG or WebP · up to 5 MB'}</small></label>
              </div>
              <label className="farmer-description-field">Description<textarea rows={3} value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <div className="farmer-form-footer"><span>Photos are stored in your product listing media.</span><button className="button button-primary" disabled={saving}>{saving ? 'Saving listing…' : editingProduct ? 'Save changes' : 'Save listing'}</button></div>
            </form>
          )}

          {loading ? <div className="workspace-state"><span className="spinner" /> Loading your listings…</div> : !isSupabaseConfigured ? <div className="workspace-state"><p>Connect Supabase to view your crop listings.</p></div> : products.length === 0 ? (
            <div className="workspace-state empty-workspace"><span className="empty-workspace-icon"><Sprout size={25} /></span><h2>No crop listings yet</h2><p>{path === '/farmer/products' ? 'Add your first product listing to track its photo, price and stock.' : 'Your crop catalogue uses the existing produce listings. Add a listing from My products & sales.'}</p>{path === '/farmer/crops' && <Link className="button button-primary" to="/farmer/products">Add a crop listing</Link>}</div>
          ) : (
            <div className="farmer-product-grid">{products.map((product) => <ProductCard key={product.id} product={product} onEdit={() => editProduct(product)} onDelete={() => void deleteProduct(product)} busy={deletingProductId === product.id} />)}</div>
          )}

          {path === '/farmer/products' && sales.length > 0 && <div className="farmer-sales-summary"><span><BadgeIndianRupee size={18} /> Sales are tracked from real order_items records; verified payouts appear in My earnings.</span><Link to="/farmer/orders">Review orders <ArrowUpRight size={15} /></Link></div>}
        </>
      )}

      {path === '/farmer/equipment' && (
        <>
          <div className="farmer-section-title-row"><div><h2>Equipment available to rent</h2><p>Browse active owner listings and send a booking request.</p></div><Link className="farmer-text-link" to="/farmer/bookings">My equipment bookings <ArrowUpRight size={15} /></Link></div>
          {loading ? <div className="workspace-state"><span className="spinner" /> Loading available equipment…</div> : equipment.length === 0 ? <div className="workspace-state empty-workspace"><span className="empty-workspace-icon"><Tractor size={25} /></span><h2>No equipment listings available</h2><p>Active equipment owner listings will appear here when available.</p></div> : <div className="farmer-equipment-grid">{equipment.map((item) => (
            <article className="farmer-equipment-card" key={item.id}>
              <div className="farmer-equipment-icon"><Tractor size={24} /></div>
              <div className="farmer-equipment-content"><span>{item.category} · {item.rate_unit}</span><h3>{item.name}</h3><p>{item.description || 'Equipment listing from a KHETIGO owner.'}</p><small>{[item.city, item.state].filter(Boolean).join(', ') || 'Location not specified'}{item.has_operator ? ' · Operator available' : ''}</small><strong>{formatMoney(item.rate_paise)} <small>/ {item.rate_unit}</small></strong></div>
              <button type="button" className="button button-primary" disabled={saving} onClick={() => { setBookingEquipment(item); setError(''); setMessage('') }}>Request booking</button>
            </article>
          ))}</div>}
          {bookingEquipment && <form className="create-resource-form farmer-booking-form" onSubmit={(event) => void requestBooking(event)}><div className="farmer-form-heading"><div><h2>Request {bookingEquipment.name}</h2><p>Rate: {formatMoney(bookingEquipment.rate_paise)} per {bookingEquipment.rate_unit}</p></div><button type="button" className="farmer-text-link" onClick={() => setBookingEquipment(null)}>Cancel</button></div><div className="form-grid"><label>Start<input type="datetime-local" value={bookingStart} onChange={(event) => setBookingStart(event.target.value)} required /></label><label>End<input type="datetime-local" value={bookingEnd} onChange={(event) => setBookingEnd(event.target.value)} required /></label></div><div className="farmer-form-footer"><span>The owner will confirm or reject this request. Existing booking rules prevent overlapping confirmed bookings.</span><button className="button button-primary" disabled={saving}>{saving ? 'Sending…' : 'Send booking request'}</button></div></form>}
        </>
      )}

      {path === '/farmer/bookings' && (
        <>
          <div className="farmer-section-title-row"><div><h2>My equipment bookings</h2><p>Requests and booking decisions for your account.</p></div><Link className="farmer-text-link" to="/farmer/equipment">Find equipment <ArrowUpRight size={15} /></Link></div>
          {loading ? <div className="workspace-state"><span className="spinner" /> Loading your bookings…</div> : bookings.length === 0 ? <div className="workspace-state empty-workspace"><span className="empty-workspace-icon"><Clock3 size={25} /></span><h2>No equipment bookings yet</h2><p>Browse equipment listings to request a booking.</p><Link className="button button-primary" to="/farmer/equipment">Browse equipment</Link></div> : <div className="record-list">{bookings.map((booking) => <article className="record-card farmer-record-card" key={booking.id}><div className="record-main"><span className="record-icon"><Tractor size={19} /></span><div><h2>{booking.equipment?.name || 'Farm equipment'}</h2><p>{booking.equipment?.category || 'Equipment'} · {formatDate(booking.starts_at)} – {formatDate(booking.ends_at)} · {formatMoney(booking.total_paise)}</p></div></div><span className={`farmer-status status-${booking.status}`}>{booking.status.replaceAll('_', ' ')}</span></article>)}</div>}
        </>
      )}

      {path === '/farmer/orders' && (
        <>
          <div className="farmer-section-title-row"><div><h2>Orders for your products</h2><p>Order items are filtered by your authenticated farmer ID.</p></div><Link className="farmer-text-link" to="/farmer/products">View products <ArrowUpRight size={15} /></Link></div>
          {loading ? <div className="workspace-state"><span className="spinner" /> Loading your orders…</div> : sales.length === 0 ? <div className="workspace-state empty-workspace"><span className="empty-workspace-icon"><ShoppingBag size={25} /></span><h2>No orders yet</h2><p>Customer orders containing your products will appear here.</p></div> : <div className="record-list">{sales.map((item) => { const order = relatedOrder(item.orders); return <article className="record-card farmer-record-card" key={item.id}><div className="record-main"><span className="record-icon"><ShoppingBag size={19} /></span><div><h2>{item.product_name}</h2><p>Order {item.order_id.slice(0, 8)} · Qty {item.quantity} · {formatMoney(item.unit_price_paise)} per unit · {formatMoney(item.line_total_paise)}</p></div></div><div className="farmer-record-side"><span className={`farmer-status status-${order?.status || 'placed'}`}>{(order?.status || 'placed').replaceAll('_', ' ')}</span><small>{formatDate(order?.created_at)}</small></div></article> })}</div>}
        </>
      )}

      {path === '/farmer/earnings' && (
        <>
          <div className="farmer-overview-grid"><article className="farmer-stat-card"><span className="farmer-stat-icon"><BadgeIndianRupee size={19} /></span><span className="farmer-stat-label">Verified product payouts</span><strong>{formatMoney(verifiedEarnings)}</strong><small>From verified order payments</small></article><article className="farmer-stat-card"><span className="farmer-stat-icon"><Clock3 size={19} /></span><span className="farmer-stat-label">Payment records</span><strong>{payments.length}</strong><small>Order-linked payments</small></article></div>
          <div className="farmer-section-title-row"><div><h2>My earnings</h2><p>Only payment records linked to your account and an order are shown.</p></div></div>
          {loading ? <div className="workspace-state"><span className="spinner" /> Loading your earnings…</div> : payments.length === 0 ? <div className="workspace-state empty-workspace"><span className="empty-workspace-icon"><BadgeIndianRupee size={25} /></span><h2>No earnings recorded yet</h2><p>Verified payouts for your orders will appear here.</p></div> : <div className="record-list">{payments.map((payment) => <article className="record-card farmer-record-card" key={payment.id}><div className="record-main"><span className="record-icon"><BadgeIndianRupee size={19} /></span><div><h2>{formatMoney(payment.amount_paise)}</h2><p>Order {payment.order_id?.slice(0, 8)} · {formatDate(payment.verified_at || payment.created_at)}</p></div></div><span className={`farmer-status status-${payment.status}`}>{payment.status}</span></article>)}</div>}
        </>
      )}

      {loading && path === '/farmer/farms' && <div className="workspace-state"><span className="spinner" /> Loading farm profile…</div>}
      <div className="workspace-footnote"><ArrowUpRight size={14} /> Only records visible under your Supabase row-level security policies are shown.</div>
    </section>
  )
}
