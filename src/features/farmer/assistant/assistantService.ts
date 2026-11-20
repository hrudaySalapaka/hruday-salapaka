import { requireSupabase } from '../../../lib/supabase'

export type AssistantMode = 'chat' | 'voice' | 'camera' | 'video'
export interface AssistantMessage { id: string; role: 'farmer' | 'assistant'; text: string; createdAt: string }

const FARMER_SCOPE = 'You are KHETIGO Doctor Assistant, an agriculture assistant for farmers. Answer questions about crops, plant health, crop care, farming equipment, equipment orders, order status, and practical agricultural guidance. If a question is unrelated to farming, politely explain that you can help with farm and KHETIGO order topics only. Be cautious about diagnosing plant disease from limited evidence; state uncertainty, ask for useful details, and avoid unsafe chemical dosing. The server must independently enforce this scope and the authenticated user role.'

function endpoint(): string {
  const base = import.meta.env.VITE_FARMER_ASSISTANT_API_URL?.trim().replace(/\/$/, '')
  if (!base) throw new Error('Farmer AI is not configured yet. Set VITE_FARMER_ASSISTANT_API_URL to your authenticated assistant API URL.')
  return base
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data, error } = await requireSupabase().auth.getSession()
  if (error) throw error
  const token = data.session?.access_token
  if (!token) throw new Error('Your session expired. Sign in again to use the farmer assistant.')
  return { Authorization: `Bearer ${token}` }
}

async function readAnswer(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error : `Assistant request failed (${response.status}).`
    throw new Error(message)
  }
  if (!payload || typeof payload !== 'object' || !('answer' in payload) || typeof payload.answer !== 'string' || !payload.answer.trim()) {
    throw new Error('The assistant API returned no answer. Check that it returns JSON with an "answer" string.')
  }
  return payload.answer.trim()
}

export const assistantService = {
  async ask(mode: AssistantMode, message: string, history: AssistantMessage[]): Promise<string> {
    const base = endpoint()
    const headers = await authHeaders()
    const response = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, message, history: history.slice(-12).map(({ role, text }) => ({ role, content: text })), audience: 'farmer', instructions: FARMER_SCOPE }),
    })
    return readAnswer(response)
  },

  async analyze(mode: 'camera' | 'video', media: File, question: string): Promise<string> {
    const base = endpoint()
    const headers = await authHeaders()
    const body = new FormData()
    body.set('mode', mode)
    body.set('question', question)
    body.set('audience', 'farmer')
    body.set('instructions', FARMER_SCOPE)
    body.set('media', media, media.name)
    const response = await fetch(`${base}/analyze`, { method: 'POST', headers, body })
    return readAnswer(response)
  },
}

export function loadConversation(userId: string, mode: AssistantMode): AssistantMessage[] {
  try {
    const value = localStorage.getItem(`khetigo-farmer-assistant:${userId}:${mode}`)
    if (!value) return []
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is AssistantMessage => !!item && typeof item === 'object' && 'id' in item && typeof item.id === 'string' && 'role' in item && (item.role === 'farmer' || item.role === 'assistant') && 'text' in item && typeof item.text === 'string' && 'createdAt' in item && typeof item.createdAt === 'string') : []
  } catch { return [] }
}

export function saveConversation(userId: string, mode: AssistantMode, messages: AssistantMessage[]) {
  try { localStorage.setItem(`khetigo-farmer-assistant:${userId}:${mode}`, JSON.stringify(messages.slice(-80))) } catch { /* Conversation remains in the current page if storage is unavailable. */ }
}
