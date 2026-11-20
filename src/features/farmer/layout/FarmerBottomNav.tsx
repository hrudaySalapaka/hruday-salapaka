import { NavLink } from 'react-router-dom'
import './FarmerBottomNav.css'
import { farmerExploreConfig } from '../explore/farmerExploreConfig'

export default function FarmerBottomNav() {
  return <nav className="farmer-bottom-nav" aria-label="Farmer navigation">{farmerExploreConfig.navigation.map(({ label, href, icon: Icon }) => <NavLink key={href} to={href} end className={({ isActive }) => `farmer-bottom-link${isActive ? ' active' : ''}`}><Icon size={20} strokeWidth={1.9} /><span>{label}</span></NavLink>)}</nav>
}
