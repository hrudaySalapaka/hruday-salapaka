import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, MapPin, ShoppingCart, Trash2, Tractor } from 'lucide-react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import { getCart, money, removeFromCart, rentalRate } from '../services/rentalMarketplace'
import { clearRentalCheckoutDraft } from '../services/rentalCheckoutDraft'
import type { RentalEquipment, RentalEquipmentCartItem } from '../services/rentalMarketplace'
import '../styles/RentalMarketplace.css'

export default function RentalCart() {
  const { userId } = useOutletContext<AppContextValue>()
  const navigate = useNavigate()
  const [items, setItems] = useState<RentalEquipmentCartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  async function reload() { try { setItems(await getCart(userId)); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the rental cart.') } finally { setLoading(false) } }
  useEffect(() => { void reload() }, [userId])
  async function remove(id: string) { setBusy(id); try { await removeFromCart(id); await reload() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove this listing.') } finally { setBusy('') } }
  const estimate = items.reduce((sum, row) => sum + (rentalRate(row.equipment, 'day') || rentalRate(row.equipment, 'hour')) * Number(row.quantity), 0)
  return <main className="rental-page rental-cart-page"><header className="rental-page-header"><div><span className="fx-kicker">YOUR SAVED EQUIPMENT</span><h1>Rental cart <small>{items.length} {items.length === 1 ? 'listing' : 'listings'}</small></h1><p>Choose rental dates when you continue to checkout.</p></div><Link to="/farmer/home"><ArrowLeft size={15} /> Continue browsing</Link></header>
    {error && <div className="rental-error" role="alert">{error}</div>}{loading ? <div className="rental-loading"><span className="spinner" /> Loading cartâ€¦</div> : items.length ? <div className="rental-cart-layout"><section className="rental-cart-list">{items.map((row) => { const item: RentalEquipment = row.equipment; const period = rentalRate(item, 'day') ? 'day' : 'hour'; const sale = rentalRate(item, period); const original = rentalRate(item, period, false); const off = sale < original; return <article className="rental-cart-item" key={row.id}><Link to={`/farmer/equipment/${item.id}`} className="rental-cart-image">{item.photos[0] ? <img src={item.photos[0]} alt={item.name} /> : <Tractor size={32} />}</Link><div className="rental-cart-main"><span className="rental-card-category">{item.equipment_type}</span><Link to={`/farmer/equipment/${item.id}`}><h2>{item.name}</h2></Link><small><MapPin size={13} /> {item.service_area || item.location || 'Local owner'}</small><p>Owner: <b>{item.owner_name}</b></p><div className="rental-cart-price">{off && <span>{Math.round((original - sale) * 100 / original)}% OFF</span>}<strong>{money(sale)} <small>/{period}</small></strong>{off && <del>{money(original)} / {period}</del>}</div><div className="rental-cart-actions"><button className="rental-remove-button" onClick={() => void remove(row.id)} disabled={busy === row.id}><Trash2 size={15} /> Remove</button><button className="rental-book-now" onClick={() => navigate(`/farmer/checkout?equipment=${encodeURIComponent(item.id)}`)}><CalendarDays size={15} /> Choose dates &amp; book</button></div></div></article> })}</section><aside className="rental-cart-summary"><span className="fx-kicker">ESTIMATED RENTAL</span><h2>Cart summary</h2><div><span>{items.length} equipment listings</span><b>{money(estimate)} <small>/ day estimate</small></b></div><p>Final pricing depends on rental dates, duration, delivery choice and deposit.</p><button className="rental-primary-button" onClick={() => { clearRentalCheckoutDraft(userId); navigate(`/farmer/checkout/payment?equipment=${encodeURIComponent(items[0].equipment.id)}&cart=1`) }}>Proceed to Payment</button><small>Checkout is completed for one listing at a time.</small></aside></div> : !error && <div className="rental-empty"><ShoppingCart size={35} /><h2>Your rental cart is empty</h2><p>Add a listing to compare rentals and continue to checkout.</p><Link className="rental-primary-button" to="/farmer/home">Browse equipment</Link></div>}
  </main>
}


