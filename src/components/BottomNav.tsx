import { NavLink } from 'react-router-dom'
import { roleNavigation } from './navigation'
import type { UserRole } from '../types/user'
import './BottomNav.css'

interface BottomNavProps { role: UserRole }

export default function BottomNav({ role }: BottomNavProps) {
  const roleClass = role.toLowerCase().replaceAll(' ', '-')
  return <nav className={`mobile-bottom-nav bottom-nav-${roleClass}`} aria-label={`${role} navigation`}>{roleNavigation[role].map(({ label, href, icon: Icon }) => <NavLink key={`${label}:${href}`} to={href} end className={({ isActive }) => `bottom-link${isActive ? ' active' : ''}`}><Icon size={20} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav>
}
