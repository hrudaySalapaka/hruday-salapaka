import type { UserRole } from '../types/user'

export default function RoleFeaturePage({ role, title }: { role: UserRole; title: string }) {
  return (
    <section className="plain-page" aria-labelledby="role-feature-title">
      <p className="eyebrow">{role.toUpperCase()} WORKSPACE</p>
      <h1 id="role-feature-title">{title}</h1>
      <p>This page is not connected to a {title.toLowerCase()} workflow yet.</p>
    </section>
  )
}
