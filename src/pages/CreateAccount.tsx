import { useState, type FormEvent } from 'react'
import { Eye, EyeOff, Sprout } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/authService'
import { isSupabaseConfigured } from '../lib/supabase'
import '../assets/auth.css'

export default function CreateAccount() {
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmationRequired, setConfirmationRequired] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (fullName.trim().length < 2)
      return setError('Enter your full name.')

    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      return setError('Enter a valid email address.')

    if (password.length < 8)
      return setError('Use at least 8 characters for your password.')

    if (password !== confirmPassword)
      return setError('Your passwords do not match.')

    if (!accepted)
      return setError('Accept the Terms and Privacy Policy to continue.')

    setLoading(true)

    try {
      const result = await authService.signUp(
        fullName.trim(),
        email.trim(),
        password
      )

      if (result.session) {
        navigate('/select-role', { replace: true })
      } else {
        setConfirmationRequired(true)
      }

    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Unable to create your account. Try again.'
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

          <h1>Join KHETIGO!</h1>

          <p>Your agricultural journey starts here.</p>

        </div>

        {confirmationRequired ? (

          <div className="notice notice-success" role="status">
            Your account was created successfully.
            Check your email to confirm it, then sign in
            to choose your role.
          </div>

        ) : (

          <>

            {!isSupabaseConfigured && (
              <div className="notice notice-warning">
                Connect Supabase to enable account creation.
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
                Full Name

                <input
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Your full name"
                />
              </label>

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
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
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

              <label>
                Confirm Password

                <span className="password-field">

                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Enter your password again"
                  />

                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={
                      showConfirmPassword ? 'Hide password' : 'Show password'
                    }
                  >
                    {showConfirmPassword
                      ? <EyeOff size={19} />
                      : <Eye size={19} />}
                  </button>

                </span>
              </label>

              <label className="check-option terms-check">

                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                />

                <span>
                  I agree to the{' '}
                  <Link to="/terms">Terms</Link>
                  {' '}and{' '}
                  <Link to="/privacy">Privacy Policy</Link>.
                </span>

              </label>

              <button
                className="button button-primary button-wide"
                disabled={loading || !isSupabaseConfigured}
              >
                {loading
                  ? <><span className="spinner-small" /> Creating account...</>
                  : 'Create Account →'}
              </button>

            </form>

            <p className="auth-switch">
              Already registered?{' '}
              <Link to="/login">Sign In</Link>
            </p>

          </>

        )}

      </section>

      <p className="auth-legal">
        Your information is protected and only used to provide KHETIGO services.
      </p>

    </main>
  )
}
