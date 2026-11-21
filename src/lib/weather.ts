'use client';

import { COUNTRY } from './constants';
import { updateTrip } from './store';
import type { Trip, WxDay, WxNow } from './types';
import { daysOf } from './utils';

/**
 * 실제 날씨 (Open-Meteo, 키 필요 없음).
 * - 앞으로 16일까지는 예보, 지난 날은 관측에 가까운 값.
 * - 지난 일정·날짜는 done 으로 저장해서 더 바꾸지 않음 → 나중에 "그날 비 왔구나"를 볼 수 있음.
 */
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const REFRESH = 3 * 3600_000;

/* ---------- WMO 날씨 코드 → 앱 표현 ---------- */
export type WxKind = 'sun' | 'partly' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export function wxKind(c: number): WxKind {
  if (c === 0) return 'sun';
  if (c <= 2) return 'partly';
  if (c === 3) return 'cloud';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 57) return 'drizzle';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if (c >= 95) return 'storm';
  return 'rain';
}
export const WX_LABEL: Record<WxKind, string> = {
  sun: '맑음',
  partly: '구름 조금',
  cloud: '흐림',
  fog: '안개',
  drizzle: '이슬비',
  rain: '비',
  snow: '눈',
  storm: '뇌우',
};

/* ---------- 시간 계산 (여행지 시간 기준) ---------- */
function localNow(tz: string): string {
  // 'YYYY-MM-DDTHH:MM'
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const hourKey = (date: string, time: string) => `${date}T${time.slice(0, 2)}:00`;

interface Resp {
  hourly?: { time: string[]; weather_code: number[]; temperature_2m: number[]; precipitation_probability?: (number | null)[] };
  daily?: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max?: (number | null)[] };
}

async function get(base: string, lat: number, lng: number, tz: string, from: string, to: string, daily: boolean): Promise<Resp | null> {
  const arch = base === ARCHIVE;
  const q = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    timezone: tz,
    start_date: from,
    end_date: to,
    hourly: arch ? 'weather_code,temperature_2m' : 'weather_code,temperature_2m,precipitation_probability',
  });
  if (daily) q.set('daily', arch ? 'weather_code,temperature_2m_max,temperature_2m_min' : 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  try {
    const r = await fetch(`${base}?${q}`);
    return r.ok ? ((await r.json()) as Resp) : null;
  } catch {
    return null;
  }
}

const running = new Set<string>();

export async function syncWeather(t: Trip, force = false) {
  if (running.has(t.id)) return;
  const tz = COUNTRY[t.country].tzid;
  const now = localNow(tz);
  const today = now.slice(0, 10);
  const fcFrom = addDays(today, -90);
  const fcTo = addDays(today, 15);
  const archTo = addDays(today, -6);
  const inRange = (d: string) => d >= fcFrom && d <= fcTo;
  const canGet = (d: string) => d <= fcTo;

  const days = daysOf(t).filter((d) => !t.wxd?.[d]?.done && canGet(d));
  const items = t.plan.filter((p) => !p.wx?.done && canGet(p.date));
  if (!days.length && !items.length) return;
  const missing = items.some((p) => !p.wx && inRange(p.date)) || days.some((d) => !t.wxd?.[d] && inRange(d));
  if (!force && !missing && t.wxAt && Date.now() - Date.parse(t.wxAt) < REFRESH) return;

  running.add(t.id);
  try {
    const g0 = t.plan.find((p) => p.geo)?.geo;
    const center: [number, number] = g0 ? [g0.lat, g0.lng] : COUNTRY[t.country].center;
    // 장소별로 묶기 (약 1km 단위). 너무 많으면 나머지는 여행 중심 날씨로
    const groups = new Map<string, { lat: number; lng: number; ids: string[]; dates: Set<string> }>();
    const keyOf = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const ck = keyOf(center[0], center[1]);
    groups.set(ck, { lat: center[0], lng: center[1], ids: [], dates: new Set(days) });
    for (const p of items) {
      let k = p.geo ? keyOf(p.geo.lat, p.geo.lng) : ck;
      if (!groups.has(k) && groups.size >= 8) k = ck;
      if (!groups.has(k)) groups.set(k, { lat: p.geo!.lat, lng: p.geo!.lng, ids: [], dates: new Set() });
      const g = groups.get(k)!;
      g.ids.push(p.id);
      g.dates.add(p.date);
    }

    const hourly = new Map<string, Map<string, WxNow>>(); // group → hourKey → wx
    const dayWx: Record<string, WxDay> = {};
    await Promise.all(
      [...groups.entries()].map(async ([k, g]) => {
        const ds = [...g.dates].sort();
        if (!ds.length) return;
        const arch = ds.filter((d) => d <= archTo && d < fcFrom);
        const fc = ds.filter((d) => !(d <= archTo && d < fcFrom));
        const isCenter = k === ck;
        const res = await Promise.all([
          arch.length ? get(ARCHIVE, g.lat, g.lng, tz, arch[0], arch[arch.length - 1], isCenter) : null,
          fc.length ? get(FORECAST, g.lat, g.lng, tz, fc[0], fc[fc.length - 1], isCenter) : null,
        ]);
        const m = new Map<string, WxNow>();
        for (const r of res) {
          const h = r?.hourly;
          if (h) h.time.forEach((tm, i) => h.weather_code[i] != null && m.set(tm, { c: h.weather_code[i], t: Math.round(h.temperature_2m[i]), ...(h.precipitation_probability?.[i] != null ? { p: h.precipitation_probability[i]! } : {}) }));
          const d = r?.daily;
          if (d && isCenter)
            d.time.forEach((dt, i) => {
              if (d.weather_code[i] == null) return;
              const pp = d.precipitation_probability_max?.[i];
              dayWx[dt] = { c: d.weather_code[i], hi: Math.round(d.temperature_2m_max[i]), lo: Math.round(d.temperature_2m_min[i]), ...(pp != null ? { p: pp } : {}), ...(dt < today ? { done: true } : {}) };
            });
        }
        hourly.set(k, m);
      }),
    );

    const itemWx = new Map<string, WxNow>();
    for (const [k, g] of groups) {
      const m = hourly.get(k);
      if (!m) continue;
      for (const id of g.ids) {
        const p = t.plan.find((x) => x.id === id)!;
        const w = m.get(hourKey(p.date, p.time));
        if (!w) continue;
        // 일정 시각에서 1시간이 지났으면 그때 날씨로 확정
        const past = `${p.date}T${p.time}` < addHour(now, -1);
        itemWx.set(id, past ? { ...w, done: true } : w);
      }
    }
    if (!itemWx.size && !Object.keys(dayWx).length) return;

    updateTrip(t.id, (x) => {
      for (const p of x.plan) {
        const w = itemWx.get(p.id);
        if (w && !p.wx?.done && JSON.stringify(p.wx) !== JSON.stringify(w)) p.wx = w;
      }
      for (const [d, w] of Object.entries(dayWx)) {
        if (!daysOf(x).includes(d)) continue;
        if (x.wxd?.[d]?.done) continue;
        if (JSON.stringify(x.wxd?.[d]) !== JSON.stringify(w)) (x.wxd ??= {})[d] = w;
      }
      x.wxAt = new Date().toISOString();
    });
  } finally {
    running.delete(t.id);
  }
}

function addHour(local: string, n: number) {
  const x = new Date(local + ':00Z');
  x.setUTCHours(x.getUTCHours() + n);
  return x.toISOString().slice(0, 16);
}
