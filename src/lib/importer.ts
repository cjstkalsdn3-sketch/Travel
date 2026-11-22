'use client';

import { findMapsUrl, mapsEnabled, resolveMany, searchPlaces, type PlaceHit } from './maps';
import { tripCenter } from './plan';
import { updateTrip } from './store';
import type { Cat, Trip, Wish } from './types';
import { uid } from './utils';

/** 구글 장소 종류 → 우리 분류 */
export function kindToCat(k?: string): Cat {
  if (!k) return 'sight';
  if (/restaurant|cafe|bakery|bar|food|coffee|meal|dessert|ramen|sushi|izakaya|pub|tea/.test(k)) return 'food';
  if (/store|shop|mall|market|outlet|supermarket|boutique/.test(k)) return 'shop';
  if (/lodging|hotel|hostel|inn|resort|ryokan/.test(k)) return 'stay';
  if (/bus_station|bus_stop/.test(k)) return 'bus';
  if (/subway|train_station|transit_station|light_rail|metro/.test(k)) return 'station';
  if (/station|airport|terminal/.test(k)) return 'move';
  return 'sight';
}


const toWish = (h: PlaceHit, url: string, note = ''): Wish => ({
  id: uid(),
  title: h.name,
  type: kindToCat(h.kind),
  url,
  place: h.name,
  note,
  planId: null,
  geo: Number.isFinite(h.lat) ? { lat: h.lat, lng: h.lng, placeId: h.placeId, addr: h.addr || undefined } : null,
});

export interface ImportResult {
  added: Wish[];
  dup: number;
  list: boolean;
  err?: string;
}

/**
 * 공유받은 글(또는 클립보드)에서 장소를 꺼내 가볼 곳에 담는다.
 * 구글지도 장소 링크, 저장 목록 링크, 그냥 장소 이름 모두 받는다.
 */
export async function importShared(trip: Trip, text: string): Promise<ImportResult> {
  const s = text.trim();
  if (!s) return { added: [], dup: 0, list: false, err: '붙여넣을 내용이 없어요' };
  const url = findMapsUrl(s);
  let hits: PlaceHit[] = [];
  let list = false;
  let why = '';
  try {
    if (url) {
      const r = await resolveMany(url);
      hits = r.places;
      list = r.list;
      why = r.why ?? '';
      // 공유 글 첫 줄이 장소 이름이면 그걸로 다시 찾아봄 (목록이면 첫 줄은 목록 이름이라 안 함)
      if (!hits.length && !list) {
        const name = s.replace(url, '').split('\n').map((x) => x.trim()).find(Boolean);
        if (name && mapsEnabled) hits = (await searchPlaces(name, tripCenter(trip), trip.country)).slice(0, 1);
      }
    } else if (mapsEnabled && s.length <= 80 && !/^https?:/i.test(s)) {
      hits = (await searchPlaces(s.split('\n')[0], tripCenter(trip), trip.country)).slice(0, 1);
    } else if (/^https?:/i.test(s)) {
      return { added: [], dup: 0, list: false, err: '구글지도 링크가 아니에요. 가볼 곳에서 직접 추가해주세요.' };
    }
  } catch {
    return { added: [], dup: 0, list, err: '장소를 읽지 못했어요. 인터넷을 확인해주세요.' };
  }
  if (!hits.length) return { added: [], dup: 0, list, err: list ? '목록을 읽지 못했어요. 목록이 "공개" 또는 "링크가 있는 사용자"로 공유돼 있는지 확인해주세요.' + (why ? ` (${why})` : '') : '장소를 찾지 못했어요.' + (why ? ` (${why})` : '') };

  const seenIds = new Set(trip.wish.map((w) => w.geo?.placeId).filter(Boolean));
  const seenNames = new Set(trip.wish.map((w) => w.title));
  const added: Wish[] = [];
  let dup = 0;
  for (const h of hits) {
    if ((h.placeId && seenIds.has(h.placeId)) || seenNames.has(h.name)) {
      dup++;
      continue;
    }
    if (h.placeId) seenIds.add(h.placeId);
    seenNames.add(h.name);
    added.push(toWish(h, list ? '' : url ?? ''));
  }
  if (added.length) updateTrip(trip.id, (t) => void t.wish.unshift(...added.slice().reverse()));
  return { added, dup, list };
}
