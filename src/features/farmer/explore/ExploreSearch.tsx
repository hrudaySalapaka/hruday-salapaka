import { Mic, Search } from 'lucide-react'
import { useState } from 'react'

type SpeechResult = { 0: { transcript: string } }
type SpeechEvent = { results: ArrayLike<SpeechResult> }
type SpeechRecognizer = {
  lang: string
  onresult: ((event: SpeechEvent) => void) | null
  onerror: (() => void) | null
  start: () => void
}
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognizer; webkitSpeechRecognition?: new () => SpeechRecognizer }

export default function ExploreSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [listening, setListening] = useState(false)
  const [voiceMessage, setVoiceMessage] = useState('')

  function startVoiceSearch() {
    const speechWindow = window as SpeechWindow
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      setVoiceMessage('Voice search is not supported by this browser.')
      return
    }
    const recognition = new Recognition()
    recognition.lang = navigator.language || 'en-IN'
    recognition.onresult = (event) => {
      onChange(event.results[0]?.[0]?.transcript || '')
      setListening(false)
      setVoiceMessage('')
    }
    recognition.onerror = () => {
      setListening(false)
      setVoiceMessage('Voice search could not start. Try typing instead.')
    }
    setVoiceMessage('Listening…')
    setListening(true)
    recognition.start()
  }

  return <div className="fx-search-wrap">
    <div className="fx-search" id="search">
      <Search size={19} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Search crops, products, equipment…" aria-label="Search crops, products and equipment" />
      <button type="button" className={listening ? 'is-listening' : ''} onClick={startVoiceSearch} aria-label="Search with your voice"><Mic size={18} /></button>
    </div>
    {voiceMessage && <span className="fx-voice-status" role="status">{voiceMessage}</span>}
  </div>
}
