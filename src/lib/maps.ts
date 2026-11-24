'use client';

import type { Geo, Mode } from './types';

/**
 * 구글 지도 연동 (브라우저 쪽).
 * 장소 검색·링크 풀기·이동 시간은 /api/maps/* 서버 경로를 거친다.
 * 지도 그리기는 Maps JavaScript API를 직접 불러온다.
 */
/** 공개 키(브라우저에 노출됨). 구글 콘솔에서 웹사이트 제한으로 보호 */
export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || 'AIzaSyCN6dOXRsnO5QDgGE75fUHzwzgbalqi-sw';
export const mapsEnabled = !!MAPS_KEY;

export interface PlaceHit {
  name: string;
  addr: string;
  lat: number;
  lng: number;
  placeId?: string;
  kind?: string;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || r.statusText);
  return r.json() as Promise<T>;
}

export const isMapsUrl = (s: string) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(s.trim());

export function searchPlaces(q: string, bias?: [number, number], region?: string, type?: string): Promise<PlaceHit[]> {
  return post<{ places: PlaceHit[] }>('/api/maps/search', { q, bias, region, type }).then((r) => r.places);
}

/** 입력하는 동안 자동완성 (한국어 부분 입력도 잘 잡음). 위치는 고를 때 placeDetails로 받음 */
export interface Suggest {
  placeId: string;
  name: string;
  addr: string;
}
export function suggestPlaces(q: string, bias: [number, number], region: string, session: string): Promise<Suggest[]> {
  return post<{ list: Suggest[] }>('/api/maps/suggest', { q, bias, region, session }).then((r) => r.list);
}
/** 장소 id → 영업시간 (모르면 null, 못 받아오면 빠짐) */
export function fetchHours(ids: string[]): Promise<Record<string, [number, number, number][] | null>> {
  return post<{ hours: Record<string, [number, number, number][] | null> }>('/api/maps/hours', { ids }).then((r) => r.hours);
}

export function placeDetails(id: string, session?: string): Promise<PlaceHit> {
  return post<{ place: PlaceHit }>('/api/maps/place', { id, session }).then((r) => r.place);
}

/** 구글지도 공유 링크 → 장소 */
export function resolveLink(url: string): Promise<PlaceHit | null> {
  return post<{ place: PlaceHit | null; list?: PlaceHit[] }>('/api/maps/resolve', { url }).then((r) => r.place ?? r.list?.[0] ?? null);
}

/** 장소 링크든 저장 목록 링크든 → 장소들 */
export function resolveMany(url: string): Promise<{ places: PlaceHit[]; list: boolean; why?: string }> {
  return post<{ place: PlaceHit | null; list?: PlaceHit[]; why?: string; shape?: string }>('/api/maps/resolve', { url }).then((r) => ({
    ...(r.list ? { places: r.list, list: true } : { places: r.place ? [r.place] : [], list: false }),
    why: r.why ? `${r.why} · ${r.shape ?? ''}` : undefined,
  }));
}

/** 공유로 받은 글에서 구글지도 링크 찾기 */
export const findMapsUrl = (s: string) => s.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\S*/i)?.[0] ?? null;

export interface LegTime {
  walk: number | null;
  transit: number | null;
}
/** 모든 장소 쌍의 이동 시간(분). [i][j] */
export function travelMatrix(points: Geo[], departure?: string): Promise<LegTime[][]> {
  return post<{ m: LegTime[][] }>('/api/maps/matrix', { points: points.map((p) => [p.lat, p.lng]), departure }).then((r) => r.m);
}

/** 걸어서 15분 이내면 도보, 아니면 대중교통 (없으면 도보) */
export function pickLeg(l: LegTime | undefined): { mode: Mode; min: number } | null {
  if (!l) return null;
  if (l.walk !== null && (l.walk <= 15 || l.transit === null)) return { mode: 'walk', min: l.walk };
  if (l.transit !== null) return { mode: 'subway', min: Math.min(l.transit, l.walk ?? Infinity) };
  return null;
}

/* ---------- Maps JavaScript API 불러오기 ---------- */
let loading: Promise<typeof google.maps> | null = null;
export function loadMaps(): Promise<typeof google.maps> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const cb = '__onGoogleMaps';
    (window as unknown as Record<string, () => void>)[cb] = () => resolve(window.google.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&v=weekly&language=ko&region=KR&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error('지도를 불러오지 못했어요'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/* ---------- 주변 추천 ---------- */
export type NearKind = 'food' | 'cafe' | 'sight' | 'bar';
export interface NearHit extends PlaceHit {
  rating?: number;
  reviews?: number;
  type?: string;
  open?: boolean;
  price?: number;
  url?: string;
  summary?: string;
}
const nearCache = new Map<string, { at: number; v: Promise<NearHit[]> }>();
/** 같은 곳·같은 종류는 30분 동안 다시 안 부름 (구글 요금 아끼기) */
export function nearby(at: [number, number], kind: NearKind): Promise<NearHit[]> {
  const key = `${at[0].toFixed(4)},${at[1].toFixed(4)}:${kind}`;
  const c = nearCache.get(key);
  if (c && Date.now() - c.at < 30 * 60e3) return c.v;
  const v = post<{ places: NearHit[] }>('/api/maps/nearby', { at, kind }).then((r) => r.places);
  v.catch(() => nearCache.delete(key));
  nearCache.set(key, { at: Date.now(), v });
  return v;
}
/** 평점을 리뷰 수로 보정한 점수 (리뷰 적은 5점보다 리뷰 많은 4.5점이 위로) */
export const nearScore = (h: NearHit) => ((h.rating ?? 0) * (h.reviews ?? 0) + 4.0 * 80) / ((h.reviews ?? 0) + 80);
