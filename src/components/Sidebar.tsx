import { NavLink } from 'react-router-dom'
import { roleNavigation } from './navigation'
import type { UserRole } from '../types/user'

interface SidebarProps { role: UserRole }

export default function Sidebar({ role }: SidebarProps) {
  return <aside className="desktop-sidebar"><p className="nav-eyebrow">WORKSPACE</p><nav aria-label="Main navigation">{roleNavigation[role].map(({ label, href, icon: Icon }) => <NavLink key={href} to={href} end className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></NavLink>)}</nav><div className="sidebar-role"><span className="role-dot" />{role}</div></aside>
}
