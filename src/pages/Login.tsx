import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Sprout } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/authService'
import { isSupabaseConfigured } from '../lib/supabase'
import '../assets/auth.css'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    const normalizedEmail = email.trim()

    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail))
      return setError('Enter a valid email address.')

    if (!password)
      return setError('Enter your password.')

    setLoading(true)

    try {
      await authService.signIn(normalizedEmail, password, remember)
      navigate('/home', { replace: true })
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to sign in. Try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="auth-brand">
        <img className="brand-emblem" src="/WhatsApp%20Image%202026-11-21%20at%206.52.38%20PM.jpeg" alt="KHETIGO" />
      </Link>

      <section className="auth-card">
        <div className="auth-heading">
          <span className="auth-icon">
            <Sprout size={25} />
          </span>
          <h1>Welcome Back!</h1>
          <p>Grow your future with KHETIGO.</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="notice notice-warning">
            Connect Supabase to enable secure sign in.
            Add the project URL and anon key to your local environment.
          </div>
        )}

        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}

        <form className="form-stack" onSubmit={submit} noValidate>
          <label>
            Email Address
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <span className="password-field">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword
                  ? <EyeOff size={19} />
                  : <Eye size={19} />}
              </button>
            </span>
          </label>

          <div className="form-options">
            <label className="check-option">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              Remember me
            </label>

            <Link to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <button
            className="button button-primary button-wide"
            disabled={loading || !isSupabaseConfigured}
          >
            {loading
              ? <><span className="spinner-small" /> Signing in...</>
              : 'Sign In →'}
          </button>
        </form>

        <p className="auth-switch">
          New to KHETIGO?{' '}
          <Link to="/create-account">
            Create an account
          </Link>
        </p>
      </section>

      <p className="auth-legal">
        By continuing, you agree to our{' '}
        <Link to="/terms">Terms</Link> and{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </main>
  )
}

export function PasswordRecovery() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      return setError('Enter a valid email address.')

    setLoading(true)

    try {
      await authService.resetPassword(email.trim())
      setSent(true)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not request a password reset.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <Link to="/" className="auth-brand">
        <img className="brand-emblem" src="/WhatsApp%20Image%202026-11-21%20at%206.52.38%20PM.jpeg" alt="KHETIGO" />
      </Link>

      <section className="auth-card">
        <div className="auth-heading">
          <span className="auth-icon">
            <Sprout size={25} />
          </span>
          <h1>Reset Password</h1>
          <p>We'll email you a secure password reset link.</p>
        </div>

        {error && (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        )}

        {sent ? (
          <div className="notice notice-success" role="status">
            If an account exists for that email,
            a reset link has been sent.
          </div>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            <label>
              Email Address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>

            <button
              className="button button-primary button-wide"
              disabled={loading || !isSupabaseConfigured}
            >
              {loading ? 'Sending...' : 'Send Reset Link →'}
            </button>
          </form>
        )}

        <p className="auth-switch">
          <Link to="/login">← Back to Sign In</Link>
        </p>
      </section>
    </main>
  )
}
