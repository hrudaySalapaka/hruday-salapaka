import React, { useEffect, useRef, useState } from 'react'
import { ArrowRight, Globe2, Volume2, VolumeX } from 'lucide-react'
import type { PublicUserRole } from '../types/user'

interface GuestStartProps { onGetStarted: () => Promise<void>; checkingSession?: boolean; activeRole?: PublicUserRole | null }

const roles: { role: PublicUserRole; label: string; image: string }[] = [
  { role: 'Customer', label: 'Customer', image: '/role-portraits/customer.png' },
  { role: 'Farmer', label: 'Farmer', image: '/role-portraits/farmer.png' },
  { role: 'Equipment Owner', label: 'Equipment Owner', image: '/role-portraits/equipment-owner.png' },
  { role: 'Delivery Partner', label: 'Delivery Partner', image: '/role-portraits/delivery-partner.png' },
  { role: 'Ride Booking Partner', label: 'Ride Booking Partner', image: '/role-portraits/ride-booking-partner.png' },
  { role: 'Market Seller', label: 'Market Seller', image: '/role-portraits/market-seller.png' },
  { role: 'Event Manager', label: 'Event/Function Organizer', image: '/role-portraits/event-organizer.png' },
  { role: 'Food Seller', label: 'Food Seller', image: '/role-portraits/food-seller.png' },
]
const savedRoleKey = 'khetigo.lastGuestRole'

const GuestStart: React.FC<GuestStartProps> = ({ onGetStarted, checkingSession = false, activeRole = null }) => {
  const [videoError, setVideoError] = useState(false)
  const [videoMuted, setVideoMuted] = useState(true)
  const [checking, setChecking] = useState(false)
  const scrollSyncTimer = useRef<number | undefined>(undefined)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [selected, setSelected] = useState<PublicUserRole>(() => {
    const saved = window.localStorage.getItem(savedRoleKey)
    return roles.some(({ role }) => role === saved) ? saved as PublicUserRole : 'Customer'
  })
  const roleListRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef(new Map<string, HTMLButtonElement>())
  const effectiveRole = selected

  useEffect(() => {
    if (activeRole && roles.some(({ role }) => role === activeRole)) {
      setSelected(activeRole)
      window.localStorage.setItem(savedRoleKey, activeRole)
    }
  }, [activeRole])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = 0.2
    const syncMutedState = () => setVideoMuted(video.muted)
    video.addEventListener('volumechange', syncMutedState)
    syncMutedState()
    return () => video.removeEventListener('volumechange', syncMutedState)
  }, [])

  function toggleVideoMuted() {
    const video = videoRef.current
    if (!video) return
    const shouldMute = !video.muted
    if (!shouldMute) video.volume = Math.max(video.volume, 0.2)
    video.muted = shouldMute
    setVideoMuted(shouldMute)
  }

  function chooseRole(role: PublicUserRole) {
    setSelected(role)
    window.localStorage.setItem(savedRoleKey, role)
  }

  function handleRoleListScroll() {
    window.clearTimeout(scrollSyncTimer.current)
    scrollSyncTimer.current = window.setTimeout(() => {
      const roleList = roleListRef.current
      if (!roleList) return
      const center = roleList.scrollLeft + roleList.clientWidth / 2
      const centeredRole = roles.reduce((nearest, current) => {
        const nearestCard = cardRefs.current.get(nearest.role)
        const currentCard = cardRefs.current.get(current.role)
        if (!nearestCard || !currentCard) return nearest
        const nearestCenter = nearestCard.offsetLeft + nearestCard.offsetWidth / 2
        const currentCenter = currentCard.offsetLeft + currentCard.offsetWidth / 2
        return Math.abs(currentCenter - center) < Math.abs(nearestCenter - center) ? current : nearest
      }, roles[0])
      setSelected((current) => {
        if (current === centeredRole.role) return current
        window.localStorage.setItem(savedRoleKey, centeredRole.role)
        return centeredRole.role
      })
    }, 180)
  }

  useEffect(() => () => window.clearTimeout(scrollSyncTimer.current), [])

  async function handleGetStarted() {
    if (checking || checkingSession) return
    setChecking(true)
    try { await onGetStarted() } finally { setChecking(false) }
  }

  return (
    <div className="guest-page">
      <style>{`
        .guest-page{--gold:#f4c51d;--role-card-width:clamp(190px,25vw,310px);position:relative;width:100%;max-width:100%;height:100vh;height:100svh;height:100dvh;min-height:620px;overflow:hidden;overflow-x:clip;background:#050805;color:#fff;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;isolation:isolate}
        .guest-bg-video{position:absolute;z-index:-2;inset:0;width:100%;max-width:none;height:100%;object-fit:cover;object-position:center 48%;image-rendering:auto;background:#07100a;filter:saturate(1.12) contrast(1.06) brightness(.86);}
        .guest-page:before{content:"";position:absolute;z-index:-1;inset:0;background:linear-gradient(180deg,#030503 0%,#050705 7%,#050705 7.2%,transparent 10%,transparent 48%,#050705ee 71%,#050705 100%),linear-gradient(90deg,#0005,transparent 35%,transparent 70%,#0005);pointer-events:none}
        .guest-page:after{content:"";position:absolute;z-index:-1;inset:7% -5% 29%;border-bottom:2px solid #ffc927;box-shadow:0 8px 16px -13px #ffe66b,0 10px 28px -22px #ffbd00;clip-path:ellipse(90% 58% at 50% 43%);pointer-events:none}
        .guest-header{height:12%;min-height:78px;max-height:124px;position:relative;display:flex;align-items:center;justify-content:space-between;padding:10px clamp(22px,5.6vw,82px);border-bottom:1px solid #e6bc3938;z-index:2}
        .guest-brand{display:flex;align-items:center}.guest-emblem{width:clamp(46px,5vw,64px);height:clamp(46px,5vw,64px)}
        .guest-actions{display:flex;align-items:center;gap:clamp(12px,3vw,35px)}.guest-language{display:flex;align-items:center;gap:9px;color:#fff}.guest-language select{appearance:none;border:0;background:transparent;color:#fff;font-size:clamp(12px,1.7vw,23px);outline:none}.guest-language option{color:#111}.guest-language:after{content:"⌄";margin-left:-8px;font-size:20px}.guest-divider{height:40px;border-left:2px solid #e7c930}.login-link{color:white;font-size:clamp(14px,2vw,25px);font-weight:700;text-decoration:none;white-space:nowrap}.login-link:hover{color:#f8d83c}
        .guest-main{height:88%;display:grid;grid-template-rows:minmax(280px,1fr) minmax(240px,.72fr);position:relative;z-index:1}.guest-hero{position:relative;display:grid;place-items:center}.guest-center{position:relative;z-index:1;width:100%;display:flex;justify-content:center;text-align:center}.get-started-btn{min-height:clamp(62px,9vh,104px);padding:0 clamp(34px,8vw,75px);display:inline-flex;align-items:center;justify-content:center;gap:15px;border:2px solid #ffda38;border-radius:100px;color:#fff;background:linear-gradient(125deg,#00a849,#00b953);box-shadow:0 0 8px 3px #fff447,0 0 24px 10px #fbcd2090,inset 0 2px 6px #ffffff65;font-size:clamp(20px,3.2vw,38px);font-weight:800;cursor:pointer;transition:transform .22s,filter .22s}.get-started-btn:hover{transform:translateY(-3px) scale(1.015);filter:brightness(1.08)}.get-started-btn:disabled{cursor:wait;opacity:.78}.guest-btn-arrow{font-size:1.3em;line-height:.5;font-weight:400}
        .guest-role-area{position:relative;display:flex;flex-direction:column;justify-content:flex-end;padding:12px 0 max(5vh,28px);background:radial-gradient(ellipse at center 75%,#7b4b0822,transparent 58%)}.guest-role-area:before{content:"";position:absolute;inset:0 0 10%;border-top:2px solid #ffca21;border-bottom:2px solid #a87907;clip-path:ellipse(82% 58% at 50% 52%);filter:drop-shadow(0 0 8px #ffb600)}
        .role-options{position:relative;display:flex;align-items:flex-end;gap:clamp(13px,2.8vw,40px);overflow-x:auto;overflow-y:visible;padding:0 max(calc((100vw - 250px)/2),24px) 20px;scroll-snap-type:x mandatory;scroll-padding-inline:50%;scrollbar-width:none;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}.role-options::-webkit-scrollbar{display:none}.role-card{position:relative;flex:0 0 clamp(190px,25vw,310px);height:clamp(172px,26vh,280px);padding:0 0 12px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;scroll-snap-align:center;border:0;border-radius:48% 48% 17px 17px;background:radial-gradient(ellipse at 50% 55%,#467432 0%,#16381e 36%,#07140b 73%);color:#fff;cursor:pointer;opacity:.75;transform:scale(.88);transition:opacity .25s,transform .35s,filter .3s;filter:saturate(.8)}.role-card:before{content:"";position:absolute;inset:8px 10px 24px;border:1px solid #e6b92eaa;border-radius:50% 50% 16px 16px;box-shadow:inset 0 0 24px #f3b71b3b,0 0 13px #ffca2d56;pointer-events:none}.role-card[aria-pressed="true"]{height:clamp(200px,31vh,320px);opacity:1;transform:scale(1);filter:saturate(1.1);z-index:1}.role-art{position:absolute;inset:8px 8px 50px;overflow:hidden;border-radius:48% 48% 10px 10px;background:#182715}.role-art:after{content:"";position:absolute;inset:45% 0 0;background:linear-gradient(transparent,#060806c9)}.role-art img{width:100%;height:100%;object-fit:cover;object-position:center 35%;filter:saturate(1.08) contrast(1.04)}.role-label{position:relative;min-height:48px;max-width:calc(100% - 20px);padding:10px 19px;display:flex;align-items:center;justify-content:center;gap:9px;border:1px solid #e8b92d;border-radius:30px;background:linear-gradient(#171510,#090909);box-shadow:0 0 12px #efb72266;color:white;font-size:clamp(14px,1.65vw,20px);font-weight:750;text-align:center;line-height:1.15}.role-label svg{flex:none}.role-dots{position:relative;display:flex;justify-content:center;gap:15px;padding-top:8px}.role-dot{width:14px;height:14px;padding:0;border:0;border-radius:50%;background:#898b88;box-shadow:0 2px 8px #000;cursor:pointer}.role-dot.active{background:#f4df00;box-shadow:0 0 12px #f4df00}
        .hero-play{position:absolute;top:25%;left:50%;transform:translate(-50%,-50%);width:clamp(82px,12vw,136px);height:clamp(82px,12vw,136px);display:grid;place-items:center;border:3px solid #fff;border-radius:50%;background:#07100ac9;color:#fff;box-shadow:0 7px 28px #0008;cursor:pointer;transition:transform .2s,background .2s}.hero-play:hover{transform:translate(-50%,-50%) scale(1.06);background:#07100aeb}.hero-play-glyph{font-size:clamp(35px,6vw,66px);line-height:1;font-weight:700}.video-error{position:absolute;z-index:4;bottom:10px;left:50%;transform:translateX(-50%);color:#fff;background:#720b08dd;padding:9px 14px;border-radius:8px;font-size:12px;white-space:nowrap}
        @media(max-width:680px){.guest-page{min-height:600px}.guest-header{height:10%;min-height:72px;padding-inline:max(18px,env(safe-area-inset-left)) max(18px,env(safe-area-inset-right))}.guest-actions{gap:12px}.guest-divider{height:30px}.guest-language{gap:5px}.guest-language svg{width:18px}.guest-main{height:90%;grid-template-rows:minmax(230px,1fr) minmax(260px,.78fr)}.guest-role-area{padding-bottom:max(3vh,18px)}.role-card{flex-basis:clamp(168px,57vw,220px);height:clamp(168px,27vh,220px)}.role-card[aria-pressed="true"]{height:clamp(194px,32vh,250px)}.role-label{font-size:14px}.role-dots{gap:10px}.role-dot{width:10px;height:10px}.guest-bg-video{object-position:center center}}
        @media(max-height:690px){.guest-page{min-height:540px}.guest-header{min-height:66px}.guest-main{grid-template-rows:minmax(190px,1fr) minmax(230px,.8fr)}.role-card{height:160px}.role-card[aria-pressed="true"]{height:185px}.role-art{inset:10px 8px 52px}.role-label{min-height:42px;padding:8px 14px}.get-started-btn{min-height:58px}}
        @media(prefers-reduced-motion:reduce){.role-card,.get-started-btn{transition:none}.role-options{scroll-behavior:auto}}
      `}</style>

      <style>{`
        .role-options { width: 100%; min-width: 0; padding-inline: max(calc((100% - var(--role-card-width)) / 2), 12px); scroll-snap-stop: normal; scroll-snap-type: none; scroll-behavior: smooth; touch-action: pan-x; }
        .role-card { flex-basis: var(--role-card-width); min-width: 0; scroll-snap-align: none; scroll-snap-stop: normal; }
        .guest-header { height: 76px; min-height: 64px; max-height: 76px; flex: 0 0 76px; padding-block: 8px; }
        .guest-logo { font-size: clamp(20px, 2.4vw, 30px); letter-spacing: -.7px; }
        .guest-tagline { font-size: clamp(9px, 1vw, 12px); }
        .guest-tagline:before, .guest-tagline:after { width: clamp(14px, 2vw, 26px); }
        .guest-main { position: relative; height: calc(100% - 76px); min-height: 0; display: block; z-index: 1; }
        .guest-hero { position: absolute; inset: -76px 0 0; display: grid; place-items: center; }
        .guest-center { position: relative; z-index: 1; width: max-content; max-width: calc(100% - 32px); margin: 0 auto; display: flex; align-items: center; justify-content: center; }
        .guest-role-area { position: absolute; left: 0; right: 0; bottom: max(18px, env(safe-area-inset-bottom)); width: 100%; min-height: 0; justify-content: center; padding: 0 0 4px; background: none; }
        .guest-role-area:before { display: none; }
        .role-options { align-items: center; padding-block: 10px; }
        .role-art { border-radius: 14px; }
        .role-art:after { display: none; }
        .role-art img { object-fit: contain; object-position: center; }
        .role-card { height: clamp(150px, 23vh, 230px); }
        .role-card[aria-pressed="true"] { height: clamp(174px, 27vh, 260px); }
        .hero-play { top: 12px; left: auto; right: 16px; transform: none; width: 42px; height: 42px; border-width: 2px; }
        .hero-play:hover { transform: scale(1.06); }
        .hero-play-glyph { font-size: 24px; }
        .get-started-btn { pointer-events: auto; }
        .guest-bg-video { left: 0; right: 0; width: 100%; max-width: none; }
        @media (max-height: 690px) { .guest-main { gap: 8px; padding-block: 8px; } .role-card { height: 145px; } .role-card[aria-pressed="true"] { height: 165px; } }
        @media (max-width: 680px) { .guest-page { --role-card-width: clamp(168px, 57vw, 220px); min-height: 100dvh; } .guest-header { height: 68px; min-height: 68px; max-height: 68px; flex-basis: 68px; padding-inline: max(18px, env(safe-area-inset-left)) max(18px, env(safe-area-inset-right)); } .guest-main { height: calc(100% - 68px); } .guest-hero { inset-block-start: -68px; } .guest-logo { font-size: 22px; } .guest-tagline { font-size: 9px; } }
      `}</style>

      <style>{`
        .guest-page { height: 100dvh; min-height: 480px; max-height: none; overflow: hidden; }
        .guest-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: clamp(12px, 3vw, 36px); padding-inline: clamp(16px, 5vw, 72px); }
        .guest-brand, .guest-actions, .guest-language { min-width: 0; }
        .guest-logo { white-space: nowrap; font-size: clamp(19px, 2.2vw, 30px); }
        .guest-tagline { white-space: nowrap; }
        .guest-actions { gap: clamp(8px, 2vw, 24px); }
        .guest-language { gap: 6px; }
        .guest-language select { max-width: clamp(62px, 10vw, 100px); }
        .guest-login-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .guest-mute-button { min-height: 24px; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 2px 6px; border: 1px solid #ffffff55; border-radius: 99px; background: #07100a9c; color: #fff; font-size: clamp(9px, 1vw, 11px); font-weight: 650; cursor: pointer; }
        .guest-mute-button:hover { background: #07100aeb; }
        .guest-mute-button svg { width: 13px; height: 13px; flex: none; }
        .guest-divider { height: 28px; }
        .login-link { font-size: clamp(13px, 1.5vw, 18px); }
        .guest-main { height: calc(100% - 76px); }
        .guest-hero { inset: -76px 0 0; }
        .get-started-btn { max-width: calc(100vw - 32px); min-height: clamp(52px, 8vh, 84px); padding-inline: clamp(24px, 5vw, 64px); font-size: clamp(18px, 2.5vw, 32px); }
        .guest-role-area { bottom: max(12px, env(safe-area-inset-bottom)); }
        .role-options { box-sizing: border-box; align-items: stretch; gap: clamp(10px, 2vw, 24px); overflow-x: auto; overflow-y: hidden; padding: 10px max(calc((100% - var(--role-card-width)) / 2), 16px); }
        .guest-role-area, .role-options { border: 0; background: transparent; box-shadow: none; }
        .role-card { flex: 0 0 var(--role-card-width); min-width: 0; height: clamp(170px, 24vh, 230px); padding: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 8px; border: 0; border-radius: 0; background: transparent; box-shadow: none; opacity: .85; transform: none; filter: none; }
        .role-card:before { display: none; }
        .role-card[aria-pressed="true"] { height: clamp(170px, 24vh, 230px); opacity: 1; transform: none; filter: none; }
        .role-art { position: relative; inset: auto; flex: 0 0 clamp(118px, 17vh, 148px); width: min(100%, 126px); height: clamp(118px, 17vh, 148px); display: grid; place-items: center; overflow: visible; border-radius: 0; background: transparent; }
        .role-art img { width: 100%; height: 100%; object-fit: contain; object-position: center; filter: none; }
        .role-label { min-height: 0; width: 100%; max-width: 100%; gap: 8px; padding: 0 4px; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: #fff; font-size: clamp(13px, 1.4vw, 17px); font-weight: 700; line-height: 1.25; text-align: center; }
        .role-label svg { display: none; }
        .video-error { max-width: calc(100% - 24px); white-space: normal; text-align: center; }
        @media (max-width: 680px) {
          .guest-page { --role-card-width: clamp(166px, 58vw, 220px); }
          .guest-header { height: 68px; min-height: 68px; max-height: 68px; flex-basis: 68px; padding-inline: max(14px, env(safe-area-inset-left)) max(14px, env(safe-area-inset-right)); }
          .guest-main { height: calc(100% - 68px); }
          .guest-hero { inset-block-start: -68px; }
          .guest-logo { font-size: clamp(18px, 5vw, 22px); }
          .guest-tagline { font-size: 8px; gap: 4px; }
          .guest-tagline:before, .guest-tagline:after { width: 12px; }
          .guest-actions { gap: 8px; }
          .guest-language svg { width: 17px; height: 17px; }
          .guest-language select { max-width: 62px; font-size: 12px; }
          .guest-divider { height: 24px; }
          .login-link { font-size: 13px; }
          .role-options { padding-inline: max(calc((100% - var(--role-card-width)) / 2), 12px); }
          .role-card, .role-card[aria-pressed="true"] { height: clamp(142px, 24vh, 196px); gap: 9px; }
          .role-art { flex-basis: clamp(108px, 17vh, 136px); width: min(100%, 116px); height: clamp(108px, 17vh, 136px); }
        }
        @media (max-width: 380px) {
          .guest-header { grid-template-columns: minmax(0, 1fr) auto; gap: 6px; padding-inline: 10px; }
          .guest-tagline { display: none; }
          .guest-actions { gap: 6px; }
          .guest-language { gap: 3px; }
          .guest-divider { height: 20px; }
          .login-link { font-size: 12px; }
          .get-started-btn { padding-inline: 22px; }
          .role-label { font-size: 12px; }
        }
        @media (max-height: 600px) {
          .guest-page { min-height: 0; }
          .guest-header { height: 58px; min-height: 58px; max-height: 58px; flex-basis: 58px; }
          .guest-main { height: calc(100% - 58px); }
          .guest-hero { inset-block-start: -58px; }
          .guest-role-area { bottom: max(4px, env(safe-area-inset-bottom)); }
          .role-card, .role-card[aria-pressed="true"] { height: 116px; gap: 6px; }
          .role-art { flex-basis: 68px; height: 68px; }
          .role-label { font-size: 11px; }
          .get-started-btn { min-height: 48px; }
        }
        @media (prefers-reduced-motion: reduce) { .role-options { scroll-behavior: auto; } }
      `}</style>

      <video ref={videoRef} className="guest-bg-video" autoPlay controls loop playsInline muted={videoMuted} preload="auto" onError={() => setVideoError(true)} onCanPlay={() => { if (videoRef.current) videoRef.current.volume = 0.2; setVideoError(false) }}>
        <source src="/WhatsApp Video 2026-11-21 at 2.37.17 PM.mp4" type="video/mp4" />
      </video>
      {videoError && <div className="video-error" role="status">Welcome video is unavailable. You can still continue.</div>}
      <header className="guest-header">
        <div className="guest-brand"><img className="brand-emblem guest-emblem" src="/WhatsApp%20Image%202026-11-21%20at%206.52.38%20PM.jpeg" alt="KHETIGO" /></div>
        <div className="guest-actions"><label className="guest-language"><Globe2 size={25} /><select aria-label="Language" defaultValue="English"><option value="English">English</option><option value="తెలుగు">తెలుగు</option><option value="Hindi">Hindi</option></select></label><span className="guest-divider"/><div className="guest-login-stack"><a href="/login" className="login-link">Log in</a><button type="button" className="guest-mute-button" onClick={toggleVideoMuted} aria-label={videoMuted ? "Unmute background video" : "Mute background video"} aria-pressed={!videoMuted}>{videoMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}<span>{videoMuted ? "Unmute audio" : "Mute audio"}</span></button></div></div>
      </header>
      <main className="guest-main">
        <section className="guest-hero" aria-label="Get started"><div className="guest-center"><button type="button" className="get-started-btn" onClick={() => void handleGetStarted()} disabled={checking || checkingSession}>{checking || checkingSession ? 'Checking session...' : <>Get Started <ArrowRight className="guest-btn-arrow" /></>}</button></div></section>
        <section className="guest-role-area" aria-label="Choose your role">
          <div ref={roleListRef} className="role-options" aria-label="Role selection options" onScroll={handleRoleListScroll}>
            {roles.map(({ role, label, image }) => <button key={role} ref={(element) => { if (element) cardRefs.current.set(role, element); else cardRefs.current.delete(role) }} type="button" className="role-card" aria-pressed={effectiveRole === role} aria-label={`Select ${label}`} onClick={() => chooseRole(role)}><span className="role-art" aria-hidden="true"><img src={image} alt="" loading="lazy" /></span><span className="role-label">{label}</span></button>)}
          </div>

        </section>
      </main>
    </div>
  )
}

export default GuestStart
