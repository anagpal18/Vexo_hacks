// One API surface for every screen: Kenil's server (README §3–4) when it answers, else the mock.
// Host comes from location.hostname so the dashboard works on an iPhone via the laptop's LAN IP.
import type { ApproveBody, AskResponse, Doc, HubToServer, NewTask, ServerToFamily, ServerToHub, Snapshot, Task } from '@shared/types'
import { mockCall, mockSubscribe } from './mock'

const HOST = import.meta.env.VITE_API || `${location.protocol}//${location.hostname}:8787`
const WS = HOST.replace(/^http/, 'ws')

let modeP: Promise<'live' | 'mock'> | null = null
export function apiMode() {
  if (import.meta.env.VITE_MOCK === '1') return Promise.resolve('mock' as const)
  if (!modeP) {
    const c = new AbortController()
    const to = setTimeout(() => c.abort(), 1200)
    modeP = fetch(`${HOST}/api/health`, { signal: c.signal })
      .then((r) => (r.ok ? ('live' as const) : ('mock' as const)))
      .catch(() => 'mock' as const)
      .finally(() => clearTimeout(to))
  }
  return modeP
}
const live = async () => (await apiMode()) === 'live'

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${HOST}${path}`, { ...init, headers: init?.body instanceof FormData ? init.headers : { 'content-type': 'application/json', ...(init?.headers || {}) } })
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${r.status}`)
  return r.json()
}
const post = <T>(path: string, body?: unknown) => j<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  state: async (): Promise<Snapshot> => ((await live()) ? j('/api/state') : mockCall('state')),
  addTask: async (b: NewTask): Promise<Task> => ((await live()) ? post('/api/tasks', b) : mockCall('addTask', b)),
  patchTask: async (id: string, patch: Partial<Task>): Promise<Task> => ((await live()) ? j(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }) : mockCall('patchTask', { id, patch })),
  uploadDoc: async (file: File): Promise<Doc> => {
    if (await live()) {
      const fd = new FormData()
      fd.append('file', file)
      return j('/api/documents', { method: 'POST', body: fd })
    }
    return mockCall('uploadDoc', { filename: file.name, previewUrl: URL.createObjectURL(file) })
  },
  doc: async (id: string): Promise<Doc | null> => ((await live()) ? j(`/api/documents/${id}`) : mockCall('getDoc', { id })),
  approve: async (id: string, body: ApproveBody): Promise<{ tasks: Task[] }> => ((await live()) ? post(`/api/documents/${id}/approve`, body) : mockCall('approve', { id, body })),
  ask: async (question: string): Promise<AskResponse> => ((await live()) ? post('/api/ask', { question }) : mockCall('ask', { question })),
  digest: async (): Promise<{ text: string }> => ((await live()) ? post('/api/digest') : mockCall('digest')),
  demo: {
    advance: async (b: { minutes?: number; to?: string }) => ((await live()) ? post('/api/demo/advance', b) : mockCall('advance', b)),
    say: async (text: string) => ((await live()) ? post('/api/demo/say', { text }) : mockCall('say', { text })),
    event: async (kind: 'free-fall' | 'double-tap') => ((await live()) ? post('/api/demo/event', { kind }) : mockCall('event', { kind })),
    reset: async () => ((await live()) ? post('/api/demo/reset') : mockCall('reset')),
  },
}
/** generated speech lives on the server */
export const audioUrl = (u: string) => (u.startsWith('http') ? u : `${HOST}${u}`)

export type Conn = { ws: WebSocket | null; send: (m: HubToServer) => void; close: () => void }

function socket<M>(path: string, onMsg: (m: M) => void, onStatus?: (s: 'open' | 'closed') => void): Conn {
  let ws: WebSocket | null = null
  let closed = false
  const open = () => {
    ws = new WebSocket(`${WS}${path}`)
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => onStatus?.('open')
    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        try {
          onMsg(JSON.parse(e.data))
        } catch {}
      }
    }
    ws.onclose = () => {
      onStatus?.('closed')
      if (!closed) setTimeout(open, 1500) // auto-reconnect
    }
  }
  open()
  return {
    get ws() {
      return ws
    },
    send: (m) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m)),
    close: () => {
      closed = true
      ws?.close()
    },
  }
}

export async function connectFamily(onMsg: (m: ServerToFamily) => void, onStatus?: (s: 'open' | 'closed') => void): Promise<Conn> {
  if (await live()) return socket('/ws/family', onMsg, onStatus)
  const off = mockSubscribe('family', onMsg)
  onStatus?.('open')
  mockCall<Snapshot>('state').then((snapshot) => onMsg({ type: 'state', snapshot }))
  return { ws: null, send: () => {}, close: off }
}

export async function connectHub(onMsg: (m: ServerToHub) => void, onStatus?: (s: 'open' | 'closed') => void): Promise<Conn> {
  if (await live()) return socket('/ws/hub', onMsg, onStatus)
  const off = mockSubscribe('hub', onMsg)
  onStatus?.('open')
  mockCall<Snapshot>('state').then((s) => {
    onMsg({ type: 'clock', now: s.now })
    const next = s.tasks.filter((t) => t.status === 'pending' || t.status === 'reminded').sort((a, b) => a.dueAt - b.dueAt)[0] ?? null
    onMsg({ type: 'next', task: next })
  })
  return { ws: null, send: (m) => void mockCall('hubMsg', m), close: off }
}
