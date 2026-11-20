import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowRight, Bell, Check, Clock3, Pencil, ImagePlus, MapPin, Package, PackagePlus, Search, Sprout, Tractor, Trash2, X } from 'lucide-react'
import { Link, Navigate, useOutletContext } from 'react-router-dom'
import FarmerWorkspacePage from './FarmerWorkspacePage'
import ExploreServices from '../explore/ExploreServices'
import { requireSupabase } from '../../../lib/supabase'
import type { AppContextValue } from '../../../types/user'
import './MyFarm.css'

type Farm = { id: string; name: string; location: string; area_acres: number | null; crop_details: string | null; image_url: string | null; created_at: string }
type Crop = { id: string; name: string; variety: string | null; quantity: number | null; unit: string | null; expected_harvest_at: string | null }
type Product = { id: string; name: string; category: string; description: string | null; price_paise: number; unit: string; quantity: number; status: string; product_images?: { storage_path: string; sort_order: number }[] }
type OrderSummary = { id: string; order_number: string; status: string; total_amount: number; created_at: string; customer_id: string; delivery_address: Record<string, unknown> | string | null; farmer_decision: string | null }
type OrderItem = { id: string; order_id: string; product_name: string; quantity: number; unit_price_paise: number; line_total_paise: number; orders: OrderSummary | OrderSummary[] | null }
type Notice = { id: string; title: string; body: string; created_at: string; read_at: string | null }
type Filter = 'all' | 'farms' | 'crops' | 'products'
type Tab = 'overview' | 'products' | 'bookings'

const emptyFarm = { name: '', location: '', area_acres: '', crop_details: '' }
const filters: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'farms', label: 'Farms' }, { id: 'crops', label: 'Crops' }, { id: 'products', label: 'Products' }]
const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((Number(paise) || 0) / 100)
const relatedOrder = (value: OrderItem['orders']) => Array.isArray(value) ? value[0] ?? null : value
const statusLabel = (order: OrderSummary) => order.farmer_decision === 'rejected' ? 'Rejected' : order.status === 'packed' || order.status === 'shipped' ? 'In Progress' : order.status === 'cancelled' ? 'Cancelled' : order.status.replaceAll('_', ' ')
const farmImagePath = (url: string | null) => { if (!url) return null; const marker = '/object/public/catalog-media/'; const index = url.indexOf(marker); return index < 0 ? null : decodeURIComponent(url.slice(index + marker.length)) }

export default function MyFarm() {
  const { userId, profile } = useOutletContext<AppContextValue>()
  const [farms, setFarms] = useState<Farm[]>([])
  const [crops, setCrops] = useState<Crop[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [notices, setNotices] = useState<Notice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyOrder, setBusyOrder] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [editingFarm, setEditingFarm] = useState<Farm | null>(null)
  const [farmModalOpen, setFarmModalOpen] = useState(false)
  const [farmForm, setFarmForm] = useState(emptyFarm)
  const [farmImage, setFarmImage] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const client = requireSupabase()
      const [farmResult, cropResult, productResult, orderResult, noticeResult] = await Promise.all([
        client.from('farms').select('id,name,location,area_acres,crop_details,image_url,created_at').eq('owner_id', userId).order('created_at', { ascending: false }),
        client.from('crops').select('id,name,variety,quantity,unit,expected_harvest_at').eq('owner_id', userId).order('created_at', { ascending: false }).limit(100),
        client.from('products').select('id,name,category,description,price_paise,unit,quantity,status,product_images(storage_path,sort_order)').eq('farmer_id', userId).order('created_at', { ascending: false }).limit(100),
        client.from('order_items').select('id,order_id,product_name,quantity,unit_price_paise,line_total_paise,orders(id,order_number,status,total_amount,created_at,customer_id,delivery_address,farmer_decision)').eq('farmer_id', userId).order('created_at', { ascending: false }).limit(100),
        client.from('notifications').select('id,title,body,created_at,read_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(5),
      ])
      if (farmResult.error) throw farmResult.error
      if (cropResult.error) throw cropResult.error
      if (productResult.error) throw productResult.error
      if (orderResult.error) throw orderResult.error
      if (noticeResult.error) throw noticeResult.error
      setFarms((farmResult.data ?? []) as Farm[])
      setCrops((cropResult.data ?? []) as Crop[])
      setProducts((productResult.data ?? []) as unknown as Product[])
      setOrderItems((orderResult.data ?? []) as unknown as OrderItem[])
      setNotices((noticeResult.data ?? []) as Notice[])
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load your farm information.') }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const client = requireSupabase()
    const channel = client.channel(`farmer-my-farm:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `farmer_id=eq.${userId}` }, () => { setMessage('A customer booking was updated.'); void load() })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => { void load() })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [load, userId])

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredFarms = useMemo(() => farms.filter((farm) => !normalizedQuery || [farm.name, farm.location, farm.crop_details].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))), [farms, normalizedQuery])
  const filteredCrops = useMemo(() => crops.filter((crop) => !normalizedQuery || [crop.name, crop.variety, crop.unit].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))), [crops, normalizedQuery])
  const filteredProducts = useMemo(() => products.filter((product) => !normalizedQuery || [product.name, product.category, product.description].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))), [products, normalizedQuery])
  const pendingOrders = new Set(orderItems.filter((item) => relatedOrder(item.orders)?.status === 'pending' && relatedOrder(item.orders)?.farmer_decision !== 'rejected').map((item) => relatedOrder(item.orders)?.id).filter(Boolean)).size
  const farmerLocation = profile?.location
  const hasCoordinates = farmerLocation && typeof farmerLocation.lat === 'number' && typeof farmerLocation.lng === 'number'

  function startAddFarm() { setEditingFarm(null); setFarmForm(emptyFarm); setFarmImage(null); setFarmModalOpen(true); setError(''); setMessage('') }
  function startEditFarm(farm: Farm) { setEditingFarm(farm); setFarmForm({ name: farm.name, location: farm.location, area_acres: farm.area_acres == null ? '' : String(farm.area_acres), crop_details: farm.crop_details ?? '' }); setFarmImage(null); setFarmModalOpen(true); setError(''); setMessage('') }

  async function saveFarm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = farmForm.name.trim(), location = farmForm.location.trim(), area = farmForm.area_acres.trim()
    if (!name || !location) { setError('Enter a farm name and location.'); return }
    if (area && (!Number.isFinite(Number(area)) || Number(area) < 0)) { setError('Enter a valid land area.'); return }
    if (farmImage && (!farmImage.type.startsWith('image/') || farmImage.size > 5 * 1024 * 1024)) { setError('Choose a farm image under 5 MB.'); return }
    setSaving(true); setError(''); setMessage('')
    let uploadedPath: string | null = null
    try {
      const client = requireSupabase()
      let imageUrl = editingFarm?.image_url ?? null
      if (farmImage) {
        const extension = farmImage.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
        uploadedPath = `${userId}/farms/${crypto.randomUUID()}.${extension}`
        const { error: uploadError } = await client.storage.from('catalog-media').upload(uploadedPath, farmImage, { contentType: farmImage.type })
        if (uploadError) throw uploadError
        imageUrl = client.storage.from('catalog-media').getPublicUrl(uploadedPath).data.publicUrl
      }
      const payload = { name, location, area_acres: area ? Number(area) : null, crop_details: farmForm.crop_details.trim() || null, image_url: imageUrl }
      const result = editingFarm
        ? await client.from('farms').update(payload).eq('id', editingFarm.id).eq('owner_id', userId)
        : await client.from('farms').insert({ ...payload, owner_id: userId })
      if (result.error) throw result.error
      if (editingFarm?.image_url && farmImage) { const oldPath = farmImagePath(editingFarm.image_url); if (oldPath) await client.storage.from('catalog-media').remove([oldPath]) }
      setEditingFarm(null); setFarmImage(null); setFarmForm(emptyFarm); setFarmModalOpen(false); setMessage(editingFarm ? 'Farm details updated.' : 'Farm added successfully.')
      await load()
    } catch (reason) {
      if (uploadedPath) await requireSupabase().storage.from('catalog-media').remove([uploadedPath])
      setError(reason instanceof Error ? reason.message : 'Could not save this farm.')
    } finally { setSaving(false) }
  }

  async function deleteFarm(farm: Farm) {
    if (!window.confirm(`Delete ${farm.name}? This removes only this farm record.`)) return
    setError(''); setMessage('')
    try {
      const client = requireSupabase()
      const { error: deleteError } = await client.from('farms').delete().eq('id', farm.id).eq('owner_id', userId)
      if (deleteError) throw deleteError
      const photoPath = farmImagePath(farm.image_url)
      if (photoPath) await client.storage.from('catalog-media').remove([photoPath])
      setMessage(`${farm.name} was deleted.`); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this farm.') }
  }

  async function decideOrder(item: OrderItem, decision: 'accepted' | 'rejected') {
    const order = relatedOrder(item.orders)
    if (!order) return
    setBusyOrder(order.id); setError(''); setMessage('')
    try {
      const status = decision === 'accepted' ? 'accepted' : 'cancelled'
      const { error: updateError } = await requireSupabase().from('orders').update({ status, farmer_decision: decision }).eq('id', order.id).eq('farmer_id', userId)
      if (updateError) throw updateError
      setMessage(decision === 'accepted' ? 'Booking accepted. The customer has been notified.' : 'Booking request rejected. The customer has been notified.')
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update this booking.') }
    finally { setBusyOrder(null) }
  }

  if (profile?.role !== 'Farmer') return <Navigate to="/home" replace />

  return <main className="my-farm-page">
    <header className="my-farm-heading"><div><span className="fx-kicker">FARMER WORKSPACE</span><h1>My Farm</h1><p>Manage your land, produce, and customer requests from one place.</p></div><div className="my-farm-location">{hasCoordinates ? <a href={`https://www.openstreetmap.org/?mlat=${farmerLocation.lat}&mlon=${farmerLocation.lng}#map=14/${farmerLocation.lat}/${farmerLocation.lng}`} target="_blank" rel="noreferrer"><MapPin size={16}/> View saved farm location</a> : <span><MapPin size={16}/>{profile?.village || 'Farm location not added'}</span>}</div></header>
    <nav className="my-farm-tabs" aria-label="My Farm sections">{([{id:'overview',label:'Farm overview',icon:Tractor},{id:'products',label:'My products',icon:Package},{id:'bookings',label:`Booking requests${pendingOrders ? ` · ${pendingOrders}` : ''}`,icon:Bell}] as const).map(({id,label,icon:Icon})=><button type="button" key={id} className={tab===id?'is-active':''} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}</nav>
    {error && <div className="my-farm-notice is-error" role="alert">{error}</div>}{message && <div className="my-farm-notice" role="status"><Check size={16}/>{message}</div>}
    {tab === 'overview' && <>
      <section className="my-farm-search-panel"><label className="my-farm-search"><Search size={18}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search your farms, crops, and products" aria-label="Search your farms, crops, and products"/><button type="button" onClick={()=>setQuery('')} aria-label="Clear search" hidden={!query}><X size={16}/></button></label><div className="my-farm-filters" role="group" aria-label="Filter search by category">{filters.map((item)=><button type="button" key={item.id} className={filter===item.id?'is-active':''} onClick={()=>setFilter(item.id)}>{item.label}</button>)}</div></section>
      <section className="my-farm-section"><div className="my-farm-section-heading"><div><span className="fx-kicker">YOUR LAND</span><h2>Farm locations</h2><p>Farm records are private to your signed-in account.</p></div><button className="my-farm-primary" type="button" onClick={startAddFarm}><PackagePlus size={17}/> Add Farm</button></div>
        {loading ? <div className="my-farm-state"><span className="spinner"/> Loading your farm data…</div> : (filter==='all'||filter==='farms') && filteredFarms.length ? <div className="my-farm-card-grid">{filteredFarms.map((farm)=><article className="my-farm-card" key={farm.id}><div className="my-farm-card-image">{farm.image_url?<img src={farm.image_url} alt={`${farm.name} farm`} loading="lazy"/>:<span><Tractor size={34}/></span>}<small>{farm.area_acres == null ? 'Area not set' : `${farm.area_acres} acres`}</small></div><div className="my-farm-card-body"><h3>{farm.name}</h3><p><MapPin size={14}/>{farm.location}</p>{farm.crop_details&&<div className="my-farm-crop-detail"><Sprout size={15}/><span>{farm.crop_details}</span></div>}<div className="my-farm-card-actions"><button type="button" onClick={()=>startEditFarm(farm)}><Pencil size={15}/> Edit</button><button type="button" className="is-danger" onClick={()=>void deleteFarm(farm)}><Trash2 size={15}/> Delete</button></div></div></article>)}</div> : !loading && (filter==='all'||filter==='farms') && <div className="my-farm-empty"><Tractor size={25}/><h3>{query?'No matching farms':'No farm records yet'}</h3><p>{query?'Try another search or category.':'Add your first farm to keep its location, area, crop details, and image together.'}</p>{!query&&<button className="my-farm-primary" type="button" onClick={startAddFarm}><PackagePlus size={16}/> Add Farm</button>}</div>}
      </section>
      {(filter==='all'||filter==='crops')&&<div className="my-farm-subsection"><div className="my-farm-section-heading"><div><span className="fx-kicker">FIELD ACTIVITY</span><h2>Crops</h2></div><Link to="/farmer/crops">Manage crops <ArrowRight size={15}/></Link></div>{loading?<div className="my-farm-state"><span className="spinner"/> Loading crops…</div>:filteredCrops.length?<div className="my-farm-mini-grid">{filteredCrops.map((crop)=><article className="my-farm-mini-card" key={crop.id}><span><Sprout size={19}/></span><div><strong>{crop.name}{crop.variety?` · ${crop.variety}`:''}</strong><small>{crop.quantity ?? '—'} {crop.unit || ''}{crop.expected_harvest_at?` · Harvest ${new Date(crop.expected_harvest_at).toLocaleDateString()}`:''}</small></div></article>)}</div>:<p className="my-farm-empty-inline">{query?'No matching crops.':'No crop records yet.'}</p>}</div>}
      {(filter==='all'||filter==='products')&&<div className="my-farm-subsection"><div className="my-farm-section-heading"><div><span className="fx-kicker">READY TO SELL</span><h2>Products</h2></div><button type="button" className="my-farm-text-link" onClick={()=>setTab('products')}>Manage products <ArrowRight size={15}/></button></div>{loading?<div className="my-farm-state"><span className="spinner"/> Loading products…</div>:filteredProducts.length?<div className="my-farm-product-preview">{filteredProducts.slice(0,6).map((product)=>{const image=product.product_images?.slice().sort((a,b)=>a.sort_order-b.sort_order)[0]?.storage_path;const url=image?requireSupabase().storage.from('product-images').getPublicUrl(image).data.publicUrl:null;return <article key={product.id}>{url?<img src={url} alt={product.name} loading="lazy"/>:<span className="my-farm-product-placeholder"><Package size={22}/></span>}<div><strong>{product.name}</strong><small>{product.category} · {product.quantity} {product.unit} · {money(product.price_paise)}</small></div></article>})}</div>:<p className="my-farm-empty-inline">{query?'No matching products.':'No product listings yet.'}</p>}</div>}
      {filter==='all'&&notices.length>0&&<section className="my-farm-subsection"><div className="my-farm-section-heading"><div><span className="fx-kicker">LATEST UPDATES</span><h2>Notifications</h2></div><Link to="/notifications">View all <ArrowRight size={15}/></Link></div><div className="my-farm-notification-list">{notices.slice(0,3).map((notice)=><article key={notice.id}><Bell size={16}/><span><strong>{notice.title}</strong><small>{notice.body} · {new Date(notice.created_at).toLocaleString()}</small></span></article>)}</div></section>}
    </>}
    {tab === 'products' && <FarmerWorkspacePage path="/farmer/products" title="My products" description="Add and manage your crop listings, photos, pricing, and stock."/>}
    {tab === 'bookings' && <section className="my-farm-section my-farm-bookings"><div className="my-farm-section-heading"><div><span className="fx-kicker">CUSTOMER ORDERS</span><h2>Booking requests</h2><p>Review customer orders containing your listed products.</p></div></div>{loading?<div className="my-farm-state"><span className="spinner"/> Loading booking requests…</div>:orderItems.length?<div className="my-farm-booking-list">{orderItems.map((item)=>{const order=relatedOrder(item.orders);if(!order)return null;const address=typeof order.delivery_address==='string'?order.delivery_address:order.delivery_address?Object.values(order.delivery_address).filter(Boolean).join(', '):'';return <article key={item.id} className="my-farm-booking-card"><div className="my-farm-booking-head"><span className="my-farm-booking-icon"><Package size={19}/></span><div><strong>{item.product_name}</strong><small>{order.order_number} · {new Date(order.created_at).toLocaleString()}</small></div><span className={`my-farm-status status-${order.farmer_decision==='rejected'?'rejected':order.status}`}>{statusLabel(order)}</span></div><div className="my-farm-booking-info"><span><b>Customer</b> ID · {order.customer_id.slice(0,8).toUpperCase()}</span><span><b>Quantity</b> {item.quantity}</span><span><b>Order total</b> {money(Math.round(order.total_amount*100))}</span>{address&&<span className="my-farm-booking-address"><b>Delivery location</b> {address}</span>}</div>{order.status==='pending'&&order.farmer_decision!=='rejected'&&<div className="my-farm-booking-actions"><button type="button" className="my-farm-secondary" disabled={busyOrder===order.id} onClick={()=>void decideOrder(item,'rejected')}><X size={15}/>{busyOrder===order.id?'Saving…':'Reject'}</button><button type="button" className="my-farm-primary" disabled={busyOrder===order.id} onClick={()=>void decideOrder(item,'accepted')}><Check size={15}/>{busyOrder===order.id?'Saving…':'Accept'}</button></div>}</article>})}</div>:<div className="my-farm-empty"><Clock3 size={25}/><h3>No booking requests</h3><p>Customer orders for your products will appear here.</p><Link to="/farmer/products">Manage your products <ArrowRight size={15}/></Link></div>}</section>}
    {farmModalOpen && <div className="my-farm-modal-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget){setEditingFarm(null);setFarmForm(emptyFarm);setFarmImage(null);setFarmModalOpen(false)}}}><form className="my-farm-modal" onSubmit={(event)=>void saveFarm(event)}><button className="my-farm-modal-close" type="button" aria-label="Close farm form" onClick={()=>{setEditingFarm(null);setFarmForm(emptyFarm);setFarmImage(null);setFarmModalOpen(false)}}><X size={19}/></button><span className="fx-kicker">FARM DETAILS</span><h2>{editingFarm?'Edit farm':'Add a farm'}</h2><label>Farm name<input value={farmForm.name} onChange={(event)=>setFarmForm((current)=>({...current,name:event.target.value}))} required maxLength={100}/></label><label>Farm location<input value={farmForm.location} onChange={(event)=>setFarmForm((current)=>({...current,location:event.target.value}))} required maxLength={180}/></label><label>Land area (acres)<input type="number" min="0" step="0.01" value={farmForm.area_acres} onChange={(event)=>setFarmForm((current)=>({...current,area_acres:event.target.value}))}/></label><label>Crop details<textarea rows={3} value={farmForm.crop_details} onChange={(event)=>setFarmForm((current)=>({...current,crop_details:event.target.value}))} placeholder="Crops grown on this farm"/></label><label className="my-farm-image-field"><ImagePlus size={17}/> Farm image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>setFarmImage(event.target.files?.[0]??null)}/><small>{farmImage?.name||'JPG, PNG, or WebP · maximum 5 MB'}</small></label><button className="my-farm-primary my-farm-submit" type="submit" disabled={saving}>{saving?'Saving…':editingFarm?'Save changes':'Save farm'}</button></form></div>}
    <ExploreServices />
  </main>
}
