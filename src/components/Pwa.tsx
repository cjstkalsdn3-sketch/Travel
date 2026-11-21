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

const PAGES = 'pages-v9'; // public/sw.js 와 같은 이름
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

/* ---------- 새 버전 자동 적용 ---------- */
const MINE = process.env.NEXT_PUBLIC_BUILD ?? '';
let lastCheck = 0;
let pendingReload = false;

/** 지금 새로고침해도 하던 일이 날아가지 않는지 (시트·입력·끌기 중이면 다음 기회에) */
const safeToReload = () =>
  !document.querySelector('.scrim') &&
  !document.documentElement.classList.contains('dragging') &&
  !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement);

async function checkUpdate(force = false) {
  if (!MINE || !navigator.onLine) return;
  if (pendingReload) {
    if (safeToReload()) location.reload();
    return;
  }
  if (!force && Date.now() - lastCheck < 15_000) return;
  lastCheck = Date.now();
  try {
    const r = await fetch('/api/version', { cache: 'no-store' });
    const { v } = (await r.json()) as { v: string };
    if (!v || v === MINE) return;
    // 혹시 새로고침해도 버전이 안 맞으면 계속 새로고침하지 않게 (한 버전당 한 번)
    try {
      if (sessionStorage.getItem('trip.reloadedFor') === v) return;
      sessionStorage.setItem('trip.reloadedFor', v);
    } catch {}
    // 서비스 워커도 새 것으로 (저장해 둔 화면·그림을 갈아끼움)
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update().catch(() => {});
    pendingReload = true;
    if (safeToReload()) location.reload();
  } catch {}
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
    // 앱으로 돌아올 때마다 새 배포가 있는지 확인. 켜둔 채로 있으면 10분마다
    const onVisible = () => document.visibilityState === 'visible' && void checkUpdate();
    document.addEventListener('visibilitychange', onVisible);
    const iv = process.env.NODE_ENV === 'production' ? setInterval(() => document.visibilityState === 'visible' && void checkUpdate(), 10 * 60_000) : undefined;
    const first = process.env.NODE_ENV === 'production' ? setTimeout(() => void checkUpdate(true), 4000) : undefined;
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(iv);
      clearTimeout(first);
    };
  }, []);
  return null;
}
