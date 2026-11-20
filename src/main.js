import './style.css'
import { supabase } from './supabaseClient.js'

document.querySelector('#app').innerHTML = `
  <h1>My Application</h1>
  <h2 id="status">Connecting to Supabase...</h2>
`

async function checkConnection() {
  const { error } = await supabase.auth.getSession()

  document.querySelector('#status').textContent =
    error
      ? 'Connection Error: ' + error.message
      : 'Supabase Connected Successfully!'
}

checkConnection()