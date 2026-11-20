import { ArrowRight, Home, PackagePlus, ShoppingBag, Sprout, Tractor, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ExploreButtonConfig {
  label: string
  icon: LucideIcon
  href: string
  visible: boolean
  action?: 'search'
  style: { color: string; background: string; fontSize: number; width: string; height: number; padding: string; borderRadius: number; position: string }
}

const buttonStyle = { color: '#ffffff', background: '#126b43', fontSize: 12, width: 'auto', height: 40, padding: '0 16px', borderRadius: 12, position: 'relative' }

export const farmerExploreConfig = {
  theme: { accent: '#126b43', deep: '#0b3d2c', canvas: '#f6f8f2', cream: '#fffdf6' },
  sections: { banners: true, categories: true, products: true, equipment: true, services: false },
  banners: [
    { eyebrow: 'FRESH FINDS FOR YOUR FARM', title: 'Good things grow here.', detail: 'Explore produce and farm essentials from the KHETIGO marketplace.', href: '/farmer/products', action: 'Explore marketplace', theme: 'produce', icon: Sprout },
    { eyebrow: 'TOOLS FOR EVERY SEASON', title: 'Get the job done, faster.', detail: 'Find equipment available to book from owners near you.', href: '/farmer/equipment', action: 'Find equipment', theme: 'equipment', icon: Tractor },
    { eyebrow: 'YOUR HARVEST, YOUR MARKET', title: 'Ready to sell your produce?', detail: 'Create a listing and connect your harvest with the KHETIGO marketplace.', href: '/farmer/add-product', action: 'List your produce', theme: 'harvest', icon: PackagePlus },
  ],
  categories: [
    { label: 'Seeds', query: 'seeds', icon: '🌱' }, { label: 'Fertilizers', query: 'fertilizer', icon: '🪴' },
    { label: 'Vegetables', query: 'vegetable', icon: '🥬' }, { label: 'Fruits', query: 'fruit', icon: '🍊' },
    { label: 'Grains', query: 'grain', icon: '🌾' }, { label: 'Farm products', query: '', icon: '🧺' },
    { label: 'Equipment', query: 'equipment', icon: '🚜' }, { label: 'Services', query: 'service', icon: '🛠️' },
  ],
  buttons: {
    sell: { label: 'Sell products', icon: PackagePlus, href: '/farmer/products', visible: true, style: buttonStyle } satisfies ExploreButtonConfig,
    seeAll: { label: 'See all', icon: ArrowRight, href: '/farmer/products', visible: true, style: buttonStyle } satisfies ExploreButtonConfig,
  },
  navigation: [
    { label: 'Home', icon: Home, href: '/home' }, { label: 'My Farm', icon: Tractor, href: '/farmer/farms' },
    { label: 'Equipment', icon: Tractor, href: '/farmer/equipment' }, { label: 'Orders', icon: ShoppingBag, href: '/farmer/orders' },
    { label: 'Profile', icon: UserRound, href: '/profile' },
  ],
  services: [
    { title: 'Delivery', detail: 'Track deliveries for your orders.', href: '/farmer/delivery', icon: '📦' },
    { title: 'Transport', detail: 'Find equipment and transport options.', href: '/farmer/equipment', icon: '🚚' },
    { title: 'Farm workers', detail: 'Worker services are coming soon.', href: '/farmer/support', icon: '👩🏽‍🌾', disabled: true },
    { title: 'Repair services', detail: 'Repair services are coming soon.', href: '/farmer/support', icon: '🔧', disabled: true },
  ],
} as const

