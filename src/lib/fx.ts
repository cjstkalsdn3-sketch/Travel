'use client';

import type { CurCode, Trip } from './types';
import { updateTrip } from './store';

/** 실시간 환율 (open.er-api.com, 키 없이 하루 단위 갱신). 6시간마다 한 번만 받아옴 */
const KEY = 'trip.fx';
const TTL = 6 * 3600_000;

interface Cached {
  at: number;
  /** 1원당 각 통화 */
  rates: Record<string, number>;
}

let inflight: Promise<Cached | null> | null = null;

function readCache(): Cached | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null') as Cached | null;
    return c && Date.now() - c.at < TTL ? c : null;
  } catch {
    return null;
  }
}

function fetchRates(): Promise<Cached | null> {
  const c = readCache();
  if (c) return Promise.resolve(c);
  inflight ??= fetch('https://open.er-api.com/v6/latest/KRW')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { result?: string; rates?: Record<string, number> } | null) => {
      if (j?.result !== 'success' || !j.rates) return null;
      const v = { at: Date.now(), rates: j.rates };
      try {
        localStorage.setItem(KEY, JSON.stringify(v));
      } catch {}
      return v;
    })
    .catch(() => null)
    .finally(() => (inflight = null));
  return inflight;
}

/** 현지 1단위당 원 */
export async function liveRate(cur: CurCode): Promise<number | null> {
  if (cur === 'KRW') return 1;
  const c = await fetchRates();
  const r = c?.rates[cur];
  return r ? Math.round((1 / r) * 10000) / 10000 : null;
}

/** 여행 환율을 실시간 값으로 (자동 모드일 때만) */
export async function syncRate(t: Trip) {
  if (t.cur === 'KRW' || t.rateAuto === false) return;
  if (t.rateAt && Date.now() - Date.parse(t.rateAt) < TTL) return;
  const r = await liveRate(t.cur);
  if (!r) return;
  updateTrip(t.id, (x) => {
    if (x.rateAuto === false || x.cur !== t.cur) return;
    x.rate = r;
    x.rateAt = new Date().toISOString();
  });
}
