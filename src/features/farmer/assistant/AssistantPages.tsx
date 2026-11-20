import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, Check, Leaf, Mic, Send, Square, Upload, Video as VideoIcon, X } from 'lucide-react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import type { AppContextValue } from '../../../types/user'
import { assistantService, loadConversation, saveConversation, type AssistantMessage } from './assistantService'
import './AssistantPages.css'

type SpeechResult = { 0?: { transcript?: string }; isFinal?: boolean }
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> }
type SpeechRecognizer = {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void; stop: () => void
}
type SpeechConstructor = new () => SpeechRecognizer

function speechConstructor(): SpeechConstructor | undefined {
  const speechWindow = window as Window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

function newMessage(role: AssistantMessage['role'], text: string): AssistantMessage {
  return { id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString() }
}

function AssistantShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  function close() {
    if (location.state && typeof location.state === 'object' && 'fromFarmerProfile' in location.state) navigate(-1)
    else navigate('/farmer/profile', { replace: true })
  }
  return <main className="farmer-assistant-page"><button type="button" className="farmer-assistant-close" onClick={close} aria-label="Close and return to Farmer Profile" title="Return to Farmer Profile"><X size={21} /></button><header className="farmer-assistant-page-heading"><span className="farmer-assistant-page-mark"><Leaf size={20} /></span><div><span className="fx-kicker">KHETIGO FARMER ASSISTANT</span><h1>{title}</h1><p>{description}</p></div></header>{children}</main>
}

function SpeechInput({ onTranscript, label = 'Ask with voice' }: { onTranscript: (text: string) => void; label?: string }) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const recognizerRef = useRef<SpeechRecognizer | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => () => { recognizerRef.current?.stop(); streamRef.current?.getTracks().forEach((track) => track.stop()) }, [])

  async function start() {
    setError('')
    const Speech = speechConstructor()
    if (!Speech) { setError('Speech recognition is not available in this browser. You can type your question instead.'); return }
    if (!navigator.mediaDevices?.getUserMedia) { setError('This browser cannot access a microphone. You can type your question instead.'); return }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const recognition = new Speech()
      recognition.lang = navigator.language || 'en-IN'
      recognition.continuous = false
      recognition.interimResults = true
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join('').trim()
        if (transcript) onTranscript(transcript)
      }
      recognition.onerror = (event) => { setRecording(false); setError(event.error === 'not-allowed' ? 'Microphone permission was denied. Allow microphone access in your browser settings.' : `Microphone recognition stopped${event.error ? ` (${event.error})` : ''}.`) }
      recognition.onend = () => setRecording(false)
      recognizerRef.current = recognition
      recognition.start()
      setRecording(true)
    } catch (reason) {
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError'
      setError(denied ? 'Microphone permission was denied. Allow microphone access in your browser settings.' : reason instanceof Error ? reason.message : 'Could not start the microphone.')
    }
  }

  function stop() { recognizerRef.current?.stop(); setRecording(false) }

  return <div className="farmer-speech-control"><button type="button" className={`farmer-speech-button${recording ? ' is-recording' : ''}`} onClick={() => recording ? stop() : void start()} aria-pressed={recording}><Mic size={17} />{recording ? 'Listening… Tap to stop' : label}</button>{error && <p className="farmer-assistant-error" role="alert">{error}</p>}</div>
}

function Conversation({ mode, title, description, allowVoice = false }: { mode: 'chat' | 'voice'; title: string; description: string; allowVoice?: boolean }) {
  const { userId } = useOutletContext<AppContextValue>()
  const [messages, setMessages] = useState(() => loadConversation(userId, mode))
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { saveConversation(userId, mode, messages); bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, mode, userId])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const text = question.trim()
    if (!text || busy) return
    const farmerMessage = newMessage('farmer', text)
    const prior = messages
    const next = [...prior, farmerMessage]
    setMessages(next)
    setQuestion('')
    setBusy(true)
    setError('')
    try {
      const answer = await assistantService.ask(mode, text, prior)
      setMessages((current) => [...current, newMessage('assistant', answer)])
      if (mode === 'voice' && 'speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(answer)) }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not reach the farmer assistant.')
    } finally { setBusy(false) }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) { setError('Spoken responses are not available in this browser.'); return }
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }

  return <AssistantShell title={title} description={description}><section className="farmer-chat-card"><div className="farmer-chat-toolbar"><span><span className="farmer-online-dot" /> Farmer-focused help</span><button type="button" onClick={() => { setMessages([]); setError('') }} disabled={!messages.length || busy}>Clear chat</button></div><div className="farmer-chat-thread" aria-live="polite">{!messages.length && <div className="farmer-chat-welcome"><span className="farmer-chat-welcome-icon"><Leaf size={22} /></span><h2>How can I help on your farm?</h2><p>Ask about crops, plant health, care, equipment, orders, or a practical farming question.</p><div className="farmer-chat-prompts">{['Why are my tomato leaves yellow?', 'How do I check an equipment booking?'].map((prompt) => <button type="button" key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}</div></div>}{messages.map((message) => <article className={`farmer-chat-message ${message.role}`} key={message.id}><div className="farmer-chat-bubble"><span>{message.role === 'farmer' ? 'You' : 'KHETIGO Assistant'}</span><p>{message.text}</p>{message.role === 'assistant' && <button type="button" className="farmer-speak-answer" onClick={() => speak(message.text)}>Read aloud</button>}</div></article>)}{busy && <article className="farmer-chat-message assistant"><div className="farmer-chat-bubble"><span>KHETIGO Assistant</span><p className="farmer-typing">Preparing a farming-focused response…</p></div></article>}<div ref={bottomRef} /></div>{error && <p className="farmer-assistant-error" role="alert">{error}</p>}{allowVoice && <SpeechInput onTranscript={setQuestion} />}<form className="farmer-chat-composer" onSubmit={(event) => void send(event)}><textarea rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a farming question…" aria-label="Your question" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} /><button type="submit" aria-label="Send question" disabled={busy || !question.trim()}><Send size={17} /><span>{busy ? 'Sending…' : 'Send'}</span></button></form><p className="farmer-chat-note">For urgent crop treatment decisions, confirm local advice before applying chemicals.</p></section></AssistantShell>
}

export function NormalChatPage() { return <Conversation mode="chat" title="AI Doctor Chat" description="Ask questions about crops, plant health, equipment, and everyday farming." /> }
export function VoiceChatPage() { return <Conversation mode="voice" title="AI Doctor Voice Chat" description="Speak a farming question and hear the assistant's response when your browser supports it." allowVoice /> }

export function VideoCallPage() {
  const { userId } = useOutletContext<AppContextValue>()
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<AssistantMessage[]>(() => loadConversation(userId, 'voice'))
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream])
  useEffect(() => { if (videoRef.current && stream) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}) } }, [stream])
  async function startVideo() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera access is not available in this browser.'); return }
    try { setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })) }
    catch (reason) { setError(reason instanceof DOMException && reason.name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access to start the video consultation.' : reason instanceof Error ? reason.message : 'Could not start the camera.') }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault()
    const text = question.trim()
    if (!text || busy) return
    const prior = messages
    const farmerMessage = newMessage('farmer', text)
    setMessages([...prior, farmerMessage])
    setQuestion('')
    setBusy(true)
    setError('')
    try {
      const response = await assistantService.ask('voice', text, prior)
      const assistantMessage = newMessage('assistant', response)
      setAnswer(response)
      setMessages((current) => [...current, assistantMessage])
      saveConversation(userId, 'voice', [...prior, farmerMessage, assistantMessage])
      if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(response)) }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not reach the farmer assistant.') }
    finally { setBusy(false) }
  }
  return <AssistantShell title="AI Doctor Video Call" description="Start your camera, ask a farm question by voice or text, and hear an AI assistant response."><section className="farmer-video-consult-layout"><div className="farmer-video-consult-camera"><div className="farmer-video-consult-view">{stream ? <video ref={videoRef} autoPlay muted playsInline aria-label="Your camera preview" /> : <div><span className="farmer-assistant-page-mark"><VideoIcon size={24}/></span><strong>Your camera preview</strong><small>Your video stays on this device during the consultation.</small></div>}</div><div className="farmer-video-consult-actions">{stream ? <button type="button" className="farmer-call-end" onClick={() => { stream.getTracks().forEach((track) => track.stop()); setStream(null) }}><VideoIcon size={16}/> Turn camera off</button> : <button type="button" className="farmer-camera-capture" onClick={() => void startVideo()}><VideoIcon size={17}/> Start video consultation</button>}</div></div><section className="farmer-video-consult-chat"><div className="farmer-chat-toolbar"><span><span className="farmer-online-dot"/> AI farming assistant</span><span className="farmer-consult-status">{stream ? 'Camera on' : 'Camera not started'}</span></div><div className="farmer-video-consult-answer" aria-live="polite">{answer ? <><span>KHETIGO Assistant</span><p>{answer}</p></> : <p>Describe what you see in the field, or use the microphone to ask out loud.</p>}</div>{error && <p className="farmer-assistant-error" role="alert">{error}</p>}<SpeechInput onTranscript={setQuestion} label="Ask by voice"/><form className="farmer-chat-composer" onSubmit={(event) => void send(event)}><textarea rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a farming question…" aria-label="Question for the AI doctor"/><button type="submit" disabled={busy || !question.trim()}><Send size={17}/><span>{busy ? 'Thinking…' : 'Ask'}</span></button></form></section></section></AssistantShell>
}

function MediaConversation({ mode, media, removeMedia }: { mode: 'camera' | 'video'; media: File; removeMedia?: () => void }) {
  const { userId } = useOutletContext<AppContextValue>()
  const [messages, setMessages] = useState(() => loadConversation(userId, mode))
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { saveConversation(userId, mode, messages); bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, mode, userId])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const text = question.trim()
    if (!text || busy) return
    setBusy(true)
    setError('')
    setMessages((current) => [...current, newMessage('farmer', text)])
    setQuestion('')
    try { const answer = await assistantService.analyze(mode, media, text); setMessages((current) => [...current, newMessage('assistant', answer)]) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not analyze this media.') }
    finally { setBusy(false) }
  }

  return <section className="farmer-media-chat"><div className="farmer-media-selected"><span><Check size={16} /> {media.name}</span>{removeMedia && <button type="button" onClick={removeMedia} aria-label="Remove captured media"><X size={16} /></button>}</div><div className="farmer-chat-thread farmer-media-thread" aria-live="polite">{!messages.length && <div className="farmer-chat-empty-hint">Ask a question about the selected photo or video. The configured AI backend must support image or video analysis.</div>}{messages.map((message) => <article className={`farmer-chat-message ${message.role}`} key={message.id}><div className="farmer-chat-bubble"><span>{message.role === 'farmer' ? 'You' : 'KHETIGO Assistant'}</span><p>{message.text}</p></div></article>)}{busy && <p className="farmer-chat-empty-hint">Analyzing your media…</p>}<div ref={bottomRef} /></div>{error && <p className="farmer-assistant-error" role="alert">{error}</p>}<SpeechInput onTranscript={setQuestion} /><form className="farmer-chat-composer" onSubmit={(event) => void send(event)}><textarea rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What should I look for in this crop?" aria-label="Question about media" onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} /><button type="submit" aria-label="Submit media and question" disabled={busy || !question.trim()}><Send size={17} /><span>{busy ? 'Analyzing…' : 'Ask about media'}</span></button></form></section>
}

export function VideoChatPage() {
  const [media, setMedia] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!media) { setUrl(''); return } const next = URL.createObjectURL(media); setUrl(next); return () => URL.revokeObjectURL(next) }, [media])
  return <AssistantShell title="Video Chat" description="Watch a crop clip and ask questions about what you see."><section className="farmer-video-layout"><div className="farmer-video-card"><div className="farmer-video-topline"><VideoIcon size={18} /><strong>Crop video</strong><span>MP4, WebM, MOV</span></div>{url ? <video className="farmer-video-player" src={url} controls playsInline /> : <button type="button" className="farmer-video-empty" onClick={() => inputRef.current?.click()}><span><Upload size={23} /></span><strong>Choose a video</strong><small>Upload a crop or equipment clip to review</small></button>}<input ref={inputRef} type="file" accept="video/*" hidden onChange={(event) => setMedia(event.target.files?.[0] ?? null)} />{media && <div className="farmer-video-actions"><span>{media.name}</span><button type="button" onClick={() => { setMedia(null); if (inputRef.current) inputRef.current.value = '' }}>Change video</button></div>}</div>{media ? <MediaConversation mode="video" media={media} /> : <div className="farmer-video-chat-prompt"><Leaf size={20} /><span>Select a video to enable questions and AI video analysis.</span></div>}</section></AssistantShell>
}

export function CameraChatPage() {
  const { userId } = useOutletContext<AppContextValue>()
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [media, setMedia] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [recording, setRecording] = useState(false)
  const [recordingError, setRecordingError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (!media) { setPreviewUrl(''); return }
    const next = URL.createObjectURL(media)
    setPreviewUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [media])

  useEffect(() => () => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop())
    stream?.getTracks().forEach((track) => track.stop())
  }, [stream])

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Camera access is not available in this browser. Use a secure HTTPS connection or choose a media file.'); return }
    let active = true
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then((camera) => {
      if (!active) { camera.getTracks().forEach((track) => track.stop()); return }
      setStream(camera)
      setCameraError('')
    }).catch((reason: unknown) => {
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError'
      setCameraError(denied ? 'Camera permission was denied. Allow camera access in your browser settings, or upload a photo/video instead.' : reason instanceof Error ? reason.message : 'Could not start the camera.')
    })
    return () => { active = false }
  }, [])

  useEffect(() => { if (videoRef.current && stream) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => {}) } }, [stream])

  function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) { setCameraError('Wait for the camera preview to become ready, then try again.'); return }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob((blob) => { if (blob) setMedia(new File([blob], `khetigo-crop-${Date.now()}.jpg`, { type: 'image/jpeg' })) }, 'image/jpeg', .9)
  }

  function toggleRecording() {
    if (recording && recorderRef.current) { recorderRef.current.stop(); setRecording(false); return }
    if (!stream || typeof MediaRecorder === 'undefined') { setRecordingError('Video recording is not supported here. You can capture a photo or upload a video instead.'); return }
    try {
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onerror = () => { setRecording(false); setRecordingError('Video recording failed. Please try again or upload a video.') }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
        if (blob.size) setMedia(new File([blob], `khetigo-crop-${Date.now()}.webm`, { type: blob.type }))
      }
      recorder.start()
      setRecording(true)
      setRecordingError('')
    } catch (reason) { setRecordingError(reason instanceof Error ? reason.message : 'Could not start video recording.') }
  }

  return <AssistantShell title="Photo Upload + Chat" description="Upload or capture a crop photo, then chat about what you see."><section className="farmer-camera-layout"><div className="farmer-camera-card"><div className="farmer-camera-view">{media && previewUrl ? media.type.startsWith('video/') ? <video src={previewUrl} controls playsInline /> : <img src={previewUrl} alt="Captured crop preview" /> : stream ? <video ref={videoRef} autoPlay muted playsInline aria-label="Live camera preview" /> : <div className="farmer-camera-placeholder"><Camera size={30} /><span>Camera preview appears here</span></div>}<canvas ref={canvasRef} hidden /></div><div className="farmer-camera-actions"><button type="button" className="farmer-camera-capture" onClick={capturePhoto} disabled={!stream || recording}><Camera size={17} /> Capture photo</button><button type="button" className={`farmer-camera-record${recording ? ' is-recording' : ''}`} onClick={toggleRecording} disabled={!stream}>{recording ? <Square size={16} /> : <VideoIcon size={17} />}{recording ? 'Stop recording' : 'Record video'}</button></div>{recording && <p className="farmer-recording-state"><span /> Recording video…</p>}{cameraError && <p className="farmer-assistant-error" role="alert">{cameraError}</p>}{recordingError && <p className="farmer-assistant-error" role="alert">{recordingError}</p>}{!stream && <button type="button" className="farmer-upload-button" onClick={() => document.getElementById('farmer-camera-upload')?.click()}><Upload size={16} /> Choose a photo or video</button>}<input id="farmer-camera-upload" type="file" accept="image/*,video/*" capture="environment" hidden onChange={(event) => setMedia(event.target.files?.[0] ?? null)} /></div>{media ? <MediaConversation key={`${userId}-${media.name}-${media.lastModified}`} mode="camera" media={media} removeMedia={() => setMedia(null)} /> : <div className="farmer-video-chat-prompt"><Camera size={19} /><span>Capture or choose media to open the question panel.</span></div>}</section></AssistantShell>
}
