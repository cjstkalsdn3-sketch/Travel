'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

/* ---------- 앱 설치(PWA) ---------- */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
let installed = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
const snap = () => (installed ? 'installed' : deferred ? 'ready' : 'none');

/** 'ready' = 설치 버튼을 보여줄 수 있음, 'installed' = 앱으로 열려 있거나 방금 설치함 */
export function useInstall() {
  const state = useSyncExternalStore(subscribe, snap, () => 'none' as const);
  async function install() {
    if (!deferred) return false;
    const ev = deferred;
    deferred = null;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') installed = true;
    emit();
    return outcome === 'accepted';
  }
  return { state, install };
}

const PAGES = 'pages-v3'; // public/sw.js 와 같은 이름
const TABS = ['', '/wish', '/money', '/check', '/info'];
const warmed = new Set<string>();

/** 본 화면들을 미리 저장해서, 인터넷이 없을 때 새로고침해도 열리게 */
function warm(path: string) {
  if (!('caches' in window) || !navigator.onLine || !navigator.serviceWorker?.controller) return;
  const m = path.match(/^\/trips\/([^/]+)/);
  const urls = m ? TABS.map((t) => `/trips/${m[1]}${t}`) : path === '/' ? ['/'] : [];
  const todo = urls.filter((u) => !warmed.has(u));
  if (!todo.length) return;
  todo.forEach((u) => warmed.add(u));
  caches
    .open(PAGES)
    .then((c) => Promise.all(todo.map((u) => savePage(c, u))))
    .catch(() => todo.forEach((u) => warmed.delete(u)));
}

/** 화면 HTML과, 그 화면이 열릴 때 이어서 받는 데이터(__NEXT_CLIENT_RESUME)까지 저장 */
async function savePage(c: Cache, u: string) {
  const r = await fetch(u, { credentials: 'same-origin' });
  if (!r.ok) return;
  const html = await r.text();
  await c.put(u, new Response(html, { headers: { 'content-type': r.headers.get('content-type') ?? 'text/html; charset=utf-8' } }));
  const m = html.match(/__NEXT_CLIENT_RESUME=fetch\(location\.pathname\+'(\?_rsc=[^']+)',\{credentials:'same-origin',headers:(\{[^}]*\})/);
  if (!m) return;
  let headers: Record<string, string> = {};
  try {
    headers = JSON.parse(m[2].replace(/'/g, '"'));
  } catch {}
  const rsc = u + m[1];
  const d = await fetch(rsc, { credentials: 'same-origin', headers });
  if (d.ok) await c.put(rsc, d);
}

export function Pwa() {
  const path = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (navigator.serviceWorker?.controller) warm(path);
    else navigator.serviceWorker?.ready.then(() => setTimeout(() => warm(path), 500)).catch(() => {});
  }, [path]);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      installed = true;
      emit();
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as InstallEvent;
      emit();
    };
    const onInstalled = () => {
      installed = true;
      deferred = null;
      emit();
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}
