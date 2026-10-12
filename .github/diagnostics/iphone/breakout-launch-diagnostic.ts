// Ignored source proposal: targeted public fixture-free causal observation.
// No timeout/native/input/layout assertion changes; no ROM/frame/PCM payloads.
import type { Page, TestInfo } from '@playwright/test';
const PREFIX = 'NOCPU_BREAKOUT_LAUNCH_DIAGNOSTIC ';
const SCREENS = ['title','loading','playing','paused','library','game-info','settings','help','about','qualification','error','unmounted','unknown_screen'];
export function parseLaunchDiagnostic(text: string): Record<string, unknown> | undefined {
  if (!text.startsWith(PREFIX) || text.length > 1024) return;
  try {
    const v=JSON.parse(text.slice(PREFIX.length));
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    const keys=['kind','type','count','screen','wallMs','id','frame','timePs','gameId'];
    if (Object.keys(v).some(k=>!keys.includes(k)) || !['heartbeat','send','receive','worker_error'].includes(v.kind)) return;
    if (typeof v.wallMs!=='number' || !Number.isFinite(v.wallMs) || v.wallMs<0 || v.wallMs>1e9) return;
    for (const key of ['id','frame']) if (key in v && (!Number.isSafeInteger(v[key]) || v[key]<0 || v[key]>1e9)) return;
    if ('gameId'in v && !['pong','breakout'].includes(v.gameId)) return;
    if ('timePs'in v && (typeof v.timePs!=='string' || !/^\d{1,20}$/.test(v.timePs))) return;
    if (v.kind==='heartbeat') {
      if (!Number.isSafeInteger(v.count) || v.count<1 || v.count>8 || !SCREENS.includes(v.screen)) return;
      if (Object.keys(v).some(k=>!['kind','count','screen','wallMs'].includes(k))) return;
    } else if (v.kind==='send') {
      if (!['init','clock','snapshot'].includes(v.type) || Object.keys(v).some(k=>!['kind','type','id','wallMs'].includes(k))) return;
    } else if (v.kind==='receive') {
      if (!['ready','frame','output','snapshot','error'].includes(v.type) || 'count'in v || 'screen'in v) return;
    } else if (Object.keys(v).some(k=>!['kind','wallMs'].includes(k))) return;
    return v;
  } catch { return; }
}
export function recordLaunchDiagnostic(rows: unknown[], text: string): void {
  if (rows.length>=64) return;
  const value=parseLaunchDiagnostic(text);if(value) rows.push(value);
}
export async function installLaunchDiagnostic(page: Page, info: TestInfo): Promise<() => Promise<void>> {
  const rows: unknown[] = [];
  page.on('console', message => recordLaunchDiagnostic(rows,message.text()));
  await page.addInitScript(() => {
    const prefix = 'NOCPU_BREAKOUT_LAUNCH_DIAGNOSTIC ';
    let count = 0, heartbeats = 0;
    const emit = (value: Record<string, unknown>) => {
      if (count++ < 48) console.info(prefix + JSON.stringify({ ...value, wallMs: performance.now() }));
    };
    const timer = setInterval(() => {
      const screen=document.querySelector<HTMLElement>('.game-shell')?.dataset.screen ?? 'unmounted';
      const safeScreen=['title','loading','playing','paused','library','game-info','settings','help','about','qualification','error','unmounted'].includes(screen)?screen:'unknown_screen';
      emit({ kind:'heartbeat', count:++heartbeats, screen:safeScreen });
      if (heartbeats === 8) clearInterval(timer);
    },250);
    const seen = new WeakSet<Worker>();
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(message: any, ...args: any[]) {
      if (!seen.has(this)) {
        seen.add(this);
        this.addEventListener('error', () => emit({ kind:'worker_error' }));
        this.addEventListener('message', event => {
          const m = event.data;
          if (['ready','frame','output','snapshot','error'].includes(m?.type)) {
            const s = m.snapshot;
            emit({ kind:'receive', type:m.type,
              ...(Number.isSafeInteger(m.id) ? {id:m.id} : {}),
              ...(s && Number.isSafeInteger(s.frame) ? {frame:s.frame} : {}),
              ...(s && ['pong','breakout'].includes(s.gameId) ? {gameId:s.gameId} : {}),
              ...(s && typeof s.timeps === 'string' && /^\d{1,20}$/.test(s.timeps) ? {timePs:s.timeps} : {}) });
          }
        });
      }
      if (['init','clock','snapshot'].includes(message?.type)) emit({ kind:'send', type:message.type,
        ...(Number.isSafeInteger(message.id) ? {id:message.id} : {}) });
      return Reflect.apply(post,this,[message,...args]);
    };
  });
  // Node-side retained allowlisted rows survive a non-responsive/closed page.
  return async () => { await info.attach('breakout-launch-responsiveness.json', {
    body:JSON.stringify({ scope:'bounded software diagnosis; original failure retained; no established renderer/core cause', rows }),
    contentType:'application/json' }); };
}
