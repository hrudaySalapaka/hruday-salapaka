import { Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'
import '../assets/auth.css'

export default function AuthEntry() {
  return (
    <main className="auth-page">
      <Link to="/" className="auth-brand">
        <img className="brand-emblem" src="/WhatsApp%20Image%202026-11-21%20at%206.52.38%20PM.jpeg" alt="KHETIGO" />
      </Link>
      <section className="auth-card">
        <div className="auth-heading">
          <span className="auth-icon"><Sprout size={25} /></span>
          <h1>Welcome to KHETIGO</h1>
          <p>Choose how you would like to continue.</p>
        </div>
        <div className="auth-entry-actions">
          <Link className="button button-primary button-wide" to="/create-account">Create Account</Link>
          <Link className="button button-outline button-wide" to="/login">Login</Link>
        </div>
        <p className="auth-switch">You can choose either option. We’ll confirm account details when you continue.</p>
      </section>
    </main>
  )
}
