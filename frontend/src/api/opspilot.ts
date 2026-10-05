import type { EventPayload, Incident } from '../types/incident'

const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '')

function apiUrl(path: string): string {
  if (!baseUrl || baseUrl === '<API_URL>') {
    throw new Error('API URL is not configured. Set VITE_API_BASE_URL in frontend/.env.local.')
  }
  return `${baseUrl}${path}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Network request failed'
    throw new Error(`Could not reach the OpsPilot API (${reason}). Check the API URL, network, and browser CORS policy.`)
  }
  const text = await response.text()
  let data: unknown
  try { data = text ? JSON.parse(text) : {} } catch { data = text }
  if (!response.ok) {
    const detail = typeof data === 'object' && data !== null && 'error' in data ? String(data.error) : `HTTP ${response.status}`
    throw new Error(`API request failed: ${detail}`)
  }
  return data as T
}

export async function triggerIncident(payload: EventPayload): Promise<{ incidentId?: string }> {
  return request('/events', { method: 'POST', body: JSON.stringify(payload) })
}

export async function getIncidents(): Promise<Incident[]> {
  const response = await request<unknown>('/incidents')
  if (Array.isArray(response)) return response as Incident[]
  if (typeof response === 'object' && response !== null && 'incidents' in response && Array.isArray(response.incidents)) {
    return response.incidents as Incident[]
  }
  throw new Error('The incidents API returned an unexpected response format.')
}
