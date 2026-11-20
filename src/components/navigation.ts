import { Bike, Clock3, ClipboardList, Home, Package, PackagePlus, Search, ShoppingBag, Store, Tractor, Truck, UserRound, Wallet, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '../types/user'

export interface NavigationLink { label: string; href: string; icon: LucideIcon }
const item = (label: string, href: string, icon: LucideIcon): NavigationLink => ({ label, href, icon })
const home = item('Home', '/home', Home)
const profile = item('Profile', '/profile', UserRound)

export const roleNavigation: Record<UserRole, NavigationLink[]> = {
  Farmer: [
    home,
    item('My Farm', '/farmer/farms', Tractor),
    item('Equipment', '/farmer/equipment', Tractor),
    item('Orders', '/farmer/orders', ShoppingBag),
    profile,
  ],
  'Equipment Owner': [
    home,
    item('Equipment', '/equipment-owner/equipment', Tractor),
    item('Bookings', '/equipment-owner/requests', Clock3),
    item('Earnings', '/equipment-owner/earnings', Wallet),
    profile,
  ],
  Customer: [
    home,
    item('Explore', '/shop', Search),
    item('Cart', '/cart', ShoppingBag),
    item('Orders', '/orders', ClipboardList),
    profile,
  ],
  'Delivery Partner': [
    home,
    item('Jobs', '/delivery/jobs', Truck),
    item('Deliveries', '/delivery/history', Package),
    item('Earnings', '/delivery/earnings', Wallet),
    profile,
  ],
  'Ride Booking Partner': [
    home,
    item('Rides', '/ride-partner/history', Bike),
    item('Requests', '/ride-partner/requests', ClipboardList),
    item('Earnings', '/ride-partner/earnings', Wallet),
    profile,
  ],
  'Market Seller': [
    home,
    item('Store', '/seller/products', Store),
    item('Add Product', '/seller/add-product', PackagePlus),
    item('Orders', '/seller/orders', ClipboardList),
    profile,
  ],
  'Event Manager': [
    home,
    item('Events', '/event-manager/events', Clock3),
    item('Create Event', '/event-manager/events/create', PackagePlus),
    item('Bookings', '/event-manager/bookings', ClipboardList),
    profile,
  ],
  'Food Seller': [
    home,
    item('Menu', '/food-seller/menu', Store),
    item('Add Food', '/food-seller/menu/add', PackagePlus),
    item('Orders', '/food-seller/orders', ClipboardList),
    profile,
  ],
  Admin: [home, item('Rental payments', '/admin/rental-payments', ShieldCheck)],
}
