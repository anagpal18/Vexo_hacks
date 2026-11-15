// Everything uses the server's demo clock (snapshot.now / clock messages), never Date.now().
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const fmtClock = (ms: number) => {
  const d = new Date(ms)
  const h = d.getHours() % 12 || 12
  return { hm: `${h}:${String(d.getMinutes()).padStart(2, '0')}`, ampm: d.getHours() < 12 ? 'AM' : 'PM' }
}
export const fmtDate = (ms: number) => new Date(ms).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
export const ago = (now: number, t: number | null) => {
  if (t == null) return 'not heard yet'
  const m = Math.max(0, Math.round((now - t) / 60000))
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`
}
/** "16:00" on the same day as `now` → ms */
export const atTime = (now: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}
