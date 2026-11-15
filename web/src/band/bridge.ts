// Band bridge for the CareLoop hub (Shresth). Contract: README.md §4 (/ws/hub).
//   const band = await connectBand({ onStatus })        // INSIDE the Connect click (Chrome opens the chooser)
//   const stream = await startStreaming(band, ws)       // mic + band events + activity -> ws; stream.stop()
// Band number: connectBand(10, ...) or ?band=10 in the address (remembered), or VITE_BAND_NUMBER. Never guessed.
// ?sim=1 = the pretend band (no hardware). The library is a copy of vexo-open-kit/js/src (MIT) in ../vexo.
// The band has no speaker and its LED is locked while the mic is on: all speech comes from the hub laptop.
import { Band, SimTransport } from '../vexo/index.js';

export type BandStatus = 'connected' | 'reconnecting' | 'disconnected';
export type VexoBand = any;
type Sink = { send(data: string | Uint8Array | ArrayBuffer): void; readyState?: number };
type ConnectOpts = { bandNumber?: number; transport?: 'ble' | 'sim' | object; onStatus?: (s: BandStatus) => void };

const EVENT_KINDS = new Set(['double-tap', 'free-fall', 'tap']);     // what the server listens for

/** Browsers block audio until a click: call this inside the Connect click so reminders can play later. */
export function unlockAudio() {
  try {
    const Ctx = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (Ctx) { const c = new Ctx(); const b = c.createBuffer(1, 1, 22050); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); c.resume?.(); }
    globalThis.speechSynthesis?.speak(Object.assign(new SpeechSynthesisUtterance(' '), { volume: 0 }));
  } catch { /* not a browser */ }
}

/** The team's band number from the page: ?band=NN (remembered), localStorage, or VITE_BAND_NUMBER. */
export function bandNumberFromPage(): number | null {
  try {
    const q = Number(new URLSearchParams(globalThis.location?.search ?? '').get('band'));
    if (Number.isInteger(q) && q > 0) { globalThis.localStorage?.setItem('careloop.band', String(q)); return q; }
    const saved = Number(globalThis.localStorage?.getItem('careloop.band'));
    if (Number.isInteger(saved) && saved > 0) return saved;
  } catch { /* no storage */ }
  const env = Number((import.meta as any).env?.VITE_BAND_NUMBER);
  return Number.isInteger(env) && env > 0 ? env : null;
}

const simFromUrl = () => { try { return new URLSearchParams(globalThis.location?.search ?? '').get('sim') === '1'; } catch { return false; } };

/** Connect the band. Call from a click. connectBand({ onStatus }) or connectBand(10, { onStatus }). */
export async function connectBand(numberOrOpts: number | ConnectOpts = {}, opts: ConnectOpts = {}): Promise<VexoBand> {
  if (typeof numberOrOpts === 'object') { opts = numberOrOpts; numberOrOpts = opts.bandNumber ?? bandNumberFromPage() ?? NaN; }
  const n = numberOrOpts;
  const { onStatus = () => {} } = opts;
  const transport = opts.transport ?? (simFromUrl() ? 'sim' : 'ble');
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error('No band number: add ?band=NN to the address (your team\'s band number).');
  unlockAudio();                                                   // still inside the click
  const band = await Band.connect(n, { transport, autoReconnect: true });
  band.on('reconnecting', () => onStatus('reconnecting'));
  band.on('reconnected', () => onStatus('connected'));
  band.on('disconnect', () => onStatus('disconnected'));
  onStatus('connected');
  return band;
}

export type StreamStats = { audioPerSec: number; audioTotal: number; events: Record<string, number>; lastActivity: any; battery: number | null };

/**
 * Stream to the hub socket: binary = one raw Opus packet (Deepgram takes it as is), JSON = audio_start /
 * band_event / activity / band_status. Sends are skipped while the socket is not open. Returns stats() and stop().
 */
export async function startStreaming(band: VexoBand, ws: Sink, { onEvent }: { onEvent?: (kind: string, time: number) => void } = {}) {
  let needStart = true;
  const stats: StreamStats = { audioPerSec: 0, audioTotal: 0, events: {}, lastActivity: null, battery: null };
  let window = 0;
  const raw = (d: string | Uint8Array) => { if (ws.readyState === undefined || ws.readyState === 1) ws.send(d); };
  const send = (m: object) => raw(JSON.stringify(m));

  const onAudio = (a: { opus: Uint8Array; time: number }) => {
    if (needStart) { send({ type: 'audio_start', time: a.time }); needStart = false; }
    raw(a.opus); stats.audioTotal++; window++;
  };
  const onBandEvent = (e: { kind: string; time: number }) => {
    if (!EVENT_KINDS.has(e.kind)) return;
    stats.events[e.kind] = (stats.events[e.kind] ?? 0) + 1;
    send({ type: 'band_event', time: e.time, kind: e.kind });
    onEvent?.(e.kind, e.time);
  };
  const onActivity = (a: { time: number; steps: number; cadence: number; state: string }) => {
    const state = a.state === 'walk' || a.state === 'run' ? a.state : 'still';
    stats.lastActivity = { steps: a.steps, cadence: a.cadence, state };
    send({ type: 'activity', time: a.time, steps: a.steps, cadence: a.cadence, state });
  };
  const onBattery = (b: { percent?: number; level?: number }) => {
    stats.battery = b.percent ?? b.level ?? null;
    send({ type: 'band_status', status: 'connected', ...(stats.battery != null ? { battery: stats.battery } : {}) });
  };
  const onReconnecting = () => send({ type: 'band_status', status: 'reconnecting' });
  const onReconnected = () => { needStart = true; send({ type: 'band_status', status: 'connected' }); };
  const onDisconnect = () => send({ type: 'band_status', status: 'disconnected' });

  const subs: [string, (x: any) => void][] = [['audio', onAudio], ['event', onBandEvent], ['activity', onActivity], ['battery', onBattery],
    ['reconnecting', onReconnecting], ['reconnected', onReconnected], ['disconnect', onDisconnect]];
  for (const [k, f] of subs) band.on(k, f);
  const rate = setInterval(() => { stats.audioPerSec = window; window = 0; }, 1000);

  send({ type: 'band_status', status: 'connected' });
  await band.configure({ audio: true, events: true, activity: true, battery: 60 });   // nothing arrives until this
  return {
    stats: () => ({ ...stats, events: { ...stats.events } }),
    async stop() {
      clearInterval(rate);
      for (const [k, f] of subs) band.off(k, f);
      try { await band.configure({ audio: false, events: false, activity: false, battery: false }); } catch { /* link gone */ }
    },
  };
}

/** For tests: a pretend band you can drive (sim.tap('free-fall'), sim.tap('double-tap'), sim.setActivity('walk')). */
export const makeSim = (n: number) => new SimTransport(n);
