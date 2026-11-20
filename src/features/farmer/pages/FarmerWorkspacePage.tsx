import FarmerDashboard from '../Dashboard'

export interface FarmerWorkspacePageProps { path: string; title: string; description: string; initialShowProductForm?: boolean }
const tables: Record<string, string> = { '/farmer/farms': 'farms', '/farmer/crops': 'crops', '/farmer/products': 'products', '/farmer/equipment': 'equipment', '/farmer/bookings': 'equipment_bookings', '/farmer/orders': 'orders', '/farmer/earnings': 'payments' }
export default function FarmerWorkspacePage(props: FarmerWorkspacePageProps) { return <FarmerDashboard {...props} table={tables[props.path] ?? 'products'} /> }
