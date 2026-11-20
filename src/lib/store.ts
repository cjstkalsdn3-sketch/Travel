'use client';

import { useSyncExternalStore } from 'react';
import type { AppData, Trip } from './types';

/**
 * 앱 데이터 저장소.
 *
 * 지금은 이 기기(localStorage)에만 저장한다. 다음 단계에서 Supabase 저장소로
 * 바꿀 때는 `load`/`persist`만 교체하고, 화면은 `useData`/`update`만 쓰므로
 * 그대로 둔다.
 */
const KEY = 'our-trip:v1';

const EMPTY: AppData = {
  version: 1,
  people: { m: { name: '민우' }, g: { name: '여자친구' } },
  last: { payer: 'm', pay: 'card' },
  trips: [],
};

let state: AppData = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    /* 저장된 값이 깨졌으면 빈 상태로 시작 */
  }
}

let onPersistError: ((msg: string) => void) | null = null;
export function setPersistErrorHandler(fn: (msg: string) => void) {
  onPersistError = fn;
}

function persist(): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    onPersistError?.('이 기기 저장 공간이 부족해요. 바우처 사진을 줄여주세요.');
    return false;
  }
}

function subscribe(fn: () => void) {
  load();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const getSnapshot = () => {
  load();
  return state;
};
const getServerSnapshot = () => EMPTY;

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** true once the client has read local data (avoid flashing the empty state) */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** 변경은 항상 이 함수로. 복사본을 고친 뒤 저장하고 화면에 알린다. */
export function update(fn: (draft: AppData) => void): boolean {
  load();
  const draft = structuredClone(state);
  fn(draft);
  state = draft;
  const ok = persist();
  listeners.forEach((l) => l());
  return ok;
}

export function updateTrip(id: string, fn: (t: Trip) => void): boolean {
  return update((d) => {
    const t = d.trips.find((x) => x.id === id);
    if (t) fn(t);
  });
}

export function useTrip(id: string | undefined): Trip | undefined {
  const d = useData();
  return d.trips.find((t) => t.id === id);
}
