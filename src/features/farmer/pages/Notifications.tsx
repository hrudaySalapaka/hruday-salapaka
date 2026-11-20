import { useEffect, useState } from 'react'
import { Bell, Check } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { requireSupabase } from '../../../lib/supabase'
import type { AppContextValue } from '../../../types/user'
import '../../farmer/explore/FarmerUtilityPage.css'

interface NotificationRow { id: string; title: string; body: string; read_at: string | null; created_at: string }
export default function FarmerNotifications() {
  const { userId } = useOutletContext<AppContextValue>()
  const [items, setItems] = useState<NotificationRow[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    void (async () => {
      try { const { data, error: resultError } = await requireSupabase().from('notifications').select('id,title,body,read_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50); if (resultError) throw resultError; if (active) setItems((data ?? []) as NotificationRow[]) }
      catch (reason) { if (active) setError(reason instanceof Error ? reason.message : 'Could not load notifications.') }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [userId])
  async function markRead(item: NotificationRow) { const readAt = new Date().toISOString(); const { error: resultError } = await requireSupabase().from('notifications').update({ read_at: readAt }).eq('id', item.id).eq('user_id', userId); if (resultError) setError(resultError.message); else setItems((rows) => rows.map((row) => row.id === item.id ? { ...row, read_at: readAt } : row)) }
  return <main className="farmer-utility"><span className="fx-kicker">FARMER WORKSPACE</span><h1>Notifications</h1><p>Activity and updates for your farmer account.</p>{error && <div className="fx-error" role="alert">{error}</div>}{loading ? <p>Loading notifications…</p> : items.length ? <div className="fu-orders">{items.map((item) => <article key={item.id}><span><Bell size={18} /></span><div><strong>{item.title}</strong><small>{item.body} · {new Date(item.created_at).toLocaleString()}</small></div>{!item.read_at && <button type="button" onClick={() => void markRead(item)} aria-label="Mark notification as read"><Check size={16} /></button>}</article>)}</div> : !error && <div className="fx-empty"><Bell size={22} /><span>No notifications yet.</span></div>}</main>
}
