// STUB — owned by Shresth (band bridge). Same signatures as aditya.md: connectBand() + startStreaming(ws).
// The real bridge uses Web Bluetooth (Chrome) and forwards Opus packets + band events + activity.
import type { HubToServer, Snapshot } from '@shared/types'

export type BandStatus = Snapshot['band']
export type Band = { name: string; mock: boolean; onStatus?: (s: BandStatus) => void }

/** MUST run inside a click handler (Chrome opens the device chooser). */
export async function connectBand(): Promise<Band> {
  await new Promise((r) => setTimeout(r, 500))
  return { name: 'Vexo-HACK-mock', mock: true }
}

/** Starts forwarding band audio/events/activity on the hub socket. Stub: just reports status. */
export async function startStreaming(ws: WebSocket | null, band?: Band): Promise<void> {
  const msg: HubToServer = { type: 'band_status', status: 'connected', battery: 86 }
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  band?.onStatus?.('connected')
}
