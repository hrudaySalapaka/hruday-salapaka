import { Sprout } from 'lucide-react'
import { Link } from 'react-router-dom'
import '../assets/auth.css'

export default function AuthEntry() {
  return (
    <main className="auth-page">
      <Link to="/" className="auth-brand">
        <span className="brand-mark"><Sprout size={25} /></span>
        <span><strong>KHETIGO</strong><small>Smart Farm Connect</small></span>
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
