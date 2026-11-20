import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function App() {
  const [status, setStatus] = useState('Connecting...')

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ error }) => {
        setStatus(
          error ? error.message : 'Supabase Connected Successfully!'
        )
      })
  }, [])

  return (
    <div>
      <h1>My App</h1>
      <h2>{status}</h2>
    </div>
  )
}

export default App
