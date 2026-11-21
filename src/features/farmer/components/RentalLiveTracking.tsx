import { useCallback, useEffect, useRef, useState } from 'react'
import { LocateFixed, MapPin, Square } from 'lucide-react'
import { requireSupabase } from '../../../lib/supabase'
import '../styles/RentalMarketplace.css'

interface Point { id: string; actor_id: string; actor_role: string; latitude: number; longitude: number; recorded_at: string }
type ViewerRole = 'farmer' | 'owner'

export default function RentalLiveTracking({ bookingId, status, viewerRole = 'farmer' }: { bookingId: string; status: string; viewerRole?: ViewerRole }) {
  const client = requireSupabase()
  const [currentStatus, setCurrentStatus] = useState(status)
  const [points, setPoints] = useState<Point[]>([])
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const watch = useRef<number | null>(null)
  const autoStarted = useRef(false)
  const lastWrite = useRef(0)
  const saving = useRef(false)
  const active = ['accepted', 'confirmed', 'delivered'].includes(currentStatus)

  const load = useCallback(async () => {
    const [bookingResult, pointsResult] = await Promise.all([
      client.from('equipment_bookings').select('status').eq('id', bookingId).maybeSingle(),
      client.from('rental_tracking_events').select('id,actor_id,actor_role,latitude,longitude,recorded_at').eq('booking_id', bookingId).order('recorded_at', { ascending: false }).limit(30),
    ])
    if (bookingResult.data?.status) setCurrentStatus(bookingResult.data.status)
    if (pointsResult.error) setError(pointsResult.error.message)
    else setPoints(((pointsResult.data || []) as Point[]).filter(point => viewerRole !== 'owner' || ['Farmer', 'Delivery Partner'].includes(point.actor_role)))
    setLoading(false)
  }, [bookingId, client, viewerRole])

  const stop = useCallback(() => {
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current)
      watch.current = null
    }
    setSharing(false)
  }, [])

  const start = useCallback(() => {
    setError('')
    if (viewerRole !== 'farmer' || currentStatus !== 'delivered') {
      setError('Location sharing starts after the owner confirms delivery.')
      return
    }
    if (!navigator.geolocation) {
      setError('This browser does not support GPS location.')
      return
    }
    setSharing(true)
    watch.current = navigator.geolocation.watchPosition(async position => {
      const now = Date.now()
      if (now - lastWrite.current < 12000 || saving.current) return
      saving.current = true
      lastWrite.current = now
      try {
        const { error: saveError } = await client.rpc('record_rental_tracking_point', { p_booking_id: bookingId, p_latitude: position.coords.latitude, p_longitude: position.coords.longitude })
        if (saveError) throw saveError
        setError('')
        await load()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not save your GPS location.')
        stop()
      } finally {
        saving.current = false
      }
    }, reason => {
      setError(reason.code === 1 ? 'Allow location access in your browser to share GPS with the equipment owner.' : reason.message || 'Could not read GPS location.')
      stop()
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 })
  }, [bookingId, client, currentStatus, load, stop, viewerRole])

  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 8000)
    return () => {
      window.clearInterval(interval)
      if (watch.current !== null) navigator.geolocation.clearWatch(watch.current)
    }
  }, [load])

  useEffect(() => {
    if (viewerRole === 'farmer' && currentStatus === 'delivered' && !sharing && !autoStarted.current) {
      autoStarted.current = true
      start()
    }
    if (!active && sharing) stop()
  }, [active, currentStatus, sharing, start, stop, viewerRole])

  return <section className="rental-tracking-card">
    <header><MapPin size={17}/><div><b>{viewerRole === 'owner' ? 'Rental live location' : 'Rental location sharing'}</b><small>{viewerRole === 'owner' ? 'The farmer or assigned delivery partner’s latest shared GPS location appears here.' : currentStatus === 'delivered' ? (sharing ? 'Your live GPS location is being shared with the equipment owner.' : 'Allow location access to share your live location.') : active ? 'Location sharing begins when the owner confirms equipment delivery.' : 'Tracking is locked; saved route history remains available.'}</small></div>
      {viewerRole === 'farmer' && currentStatus === 'delivered' && !sharing && <button onClick={start}><LocateFixed size={14}/> Share my location</button>}
      {viewerRole === 'farmer' && sharing && <button className="tracking-stop" onClick={stop}><Square size={13}/> Stop sharing</button>}
    </header>
    {error && <p className="rental-tracking-error" role="alert">{error}</p>}
    {loading ? <small>Loading saved tracking history…</small> : points.length ? <ol>{points.map(point => <li key={point.id}><span><b>{point.actor_role}</b> · {new Date(point.recorded_at).toLocaleString()}</span><a href={`https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`} target="_blank" rel="noreferrer">{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)} · Google Maps</a></li>)}</ol> : <small>{viewerRole === 'owner' ? 'Waiting for the farmer’s first location update.' : 'No GPS points have been shared for this rental.'}</small>}
  </section>
}
