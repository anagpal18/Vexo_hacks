// Pretend-band check of web/src/band/bridge.ts (no hardware): node tools/bridge-check.mjs
import { connectBand, startStreaming, makeSim } from '../web/src/band/bridge.ts';
const SIM = 99;                                  // pretend band only; the real number comes from the team (?band=NN)
const sim = makeSim(SIM);
const msgs = []; let audio = 0;
const ws = { readyState: 1, send(d) { if (typeof d === 'string') msgs.push(JSON.parse(d)); else audio++; } };
const band = await connectBand(SIM, { transport: sim, onStatus: (s) => console.log('status:', s) });
const stream = await startStreaming(band, ws, { onEvent: (k) => console.log('event:', k) });
sim.setActivity('walk');
setTimeout(() => sim.tap('free-fall'), 800);
setTimeout(() => sim.tap('double-tap'), 1500);
await new Promise((r) => setTimeout(r, 3000));
const types = msgs.reduce((m, x) => ((m[x.type] = (m[x.type] ?? 0) + 1), m), {});
console.log('json:', JSON.stringify(types), '| audio packets:', audio, '(~50/s)');
console.log('band_events:', JSON.stringify(msgs.filter((m) => m.type === 'band_event').map((m) => m.kind)));
console.log('activity:', JSON.stringify(msgs.filter((m) => m.type === 'activity').at(-1)));
console.log('band_status:', JSON.stringify(msgs.filter((m) => m.type === 'band_status')));
console.log('stats:', JSON.stringify(stream.stats()));
await stream.stop(); await band.disconnect();
