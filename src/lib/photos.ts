'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getSession, updateTrip } from './store';
import type { Photo } from './types';
import { uid } from './utils';

/**
 * 여행 기록 사진.
 *
 * - 고르면 폰에서 줄여서(원본 1600px, 작은 그림 480px) 서버 저장소(photos)에 올린다.
 * - 인터넷이 없으면 이 폰(IndexedDB)에 넣어뒀다가 연결되면 올린다. 그동안 사진에 up 표시.
 * - 보여줄 때는 7일짜리 서명 주소를 받아 기억해둔다 (비공개 저장소).
 * - 서버를 안 쓰는 모드(예시 여행 등)는 작은 사진을 기록 안에 바로 넣는다.
 */

const BUCKET = 'photos';
const FULL = 1600;
const THUMB = 480;

export interface Prepared {
  photo: Photo;
  full: Blob;
  thumb: Blob;
}

/* ---------- 사진 정보(EXIF)에서 찍은 시각 ---------- */
function exifDate(buf: ArrayBuffer): string | undefined {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return;
  let o = 2;
  while (o + 4 < v.byteLength) {
    const mk = v.getUint16(o);
    const len = v.getUint16(o + 2);
    if (mk === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return readTiff(v, o + 10);
    if ((mk & 0xff00) !== 0xff00) return;
    o += 2 + len;
  }
}
function readTiff(v: DataView, t: number): string | undefined {
  if (t + 8 > v.byteLength) return;
  const le = v.getUint16(t) === 0x4949;
  const u16 = (p: number) => v.getUint16(p, le);
  const u32 = (p: number) => v.getUint32(p, le);
  const tag = (ifd: number, want: number): number | undefined => {
    if (ifd + 2 > v.byteLength) return;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (e + 12 > v.byteLength) return;
      if (u16(e) === want) return u32(e + 8);
    }
  };
  const str = (off: number | undefined) => {
    if (off === undefined || t + off + 19 > v.byteLength) return;
    let s = '';
    for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(t + off + i));
    return s;
  };
  const ifd0 = t + u32(t + 4);
  const exif = tag(ifd0, 0x8769);
  const raw = (exif !== undefined && str(tag(t + exif, 0x9003))) || str(tag(ifd0, 0x0132));
  const m = raw?.match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/);
  // 현지 시각 그대로 (시간대 없음): "2026-12-03T14:22"
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : undefined;
}

/* ---------- 줄이기 ---------- */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image'));
    img.src = url;
  });
}
function shrink(img: HTMLImageElement, max: number, q: number): Promise<{ blob: Blob; w: number; h: number }> {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s);
  c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res({ blob: b, w: c.width, h: c.height }) : rej(new Error('blob'))), 'image/jpeg', q));
}
const toDataUrl = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(b);
  });

/** 고른 파일 → 올릴 준비가 된 사진 */
export async function preparePhoto(file: File, tripId: string): Promise<Prepared> {
  const [buf, img] = await Promise.all([file.slice(0, 256 * 1024).arrayBuffer(), loadImage(file)]);
  URL.revokeObjectURL(img.src);
  let at: string | undefined;
  try {
    at = exifDate(buf);
  } catch {}
  if (!at && file.lastModified) {
    const d = new Date(file.lastModified);
    at = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  }
  const [full, thumb] = await Promise.all([shrink(img, FULL, 0.82), shrink(img, THUMB, 0.74)]);
  const id = uid();
  const cid = getSession().coupleId;
  const photo: Photo = { id, w: full.w, h: full.h, at };
  if (cid && supabase) {
    photo.path = `${cid}/${tripId}/${id}.jpg`;
    photo.up = true;
    local.set(photo.path, URL.createObjectURL(thumb.blob));
    local.set(photo.path + '#full', URL.createObjectURL(full.blob));
  } else {
    // 서버 없는 모드: 이 기기 저장 공간이 작아서 중간 크기만
    const mid = await shrink(img, 1000, 0.7);
    photo.src = await toDataUrl(mid.blob);
  }
  return { photo, full: full.blob, thumb: thumb.blob };
}

/* ---------- 올리기 (못 올리면 이 폰에 보관) ---------- */
interface Pending {
  path: string;
  tripId: string;
  memoId: string;
  photoId: string;
  full: Blob;
  thumb: Blob;
}
const thumbPath = (p: string) => p.replace(/\.jpg$/, '_t.jpg');

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('our-trip-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pending', { keyPath: 'path' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const q = fn(d.transaction('pending', mode).objectStore('pending'));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

async function send(p: Pending) {
  const st = supabase!.storage.from(BUCKET);
  const a = await st.upload(p.path, p.full, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
  if (a.error) throw a.error;
  const b = await st.upload(thumbPath(p.path), p.thumb, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' });
  if (b.error) throw b.error;
}
function markUp(p: Pending) {
  updateTrip(p.tripId, (t) => {
    const ph = t.memo?.find((m) => m.id === p.memoId)?.photos.find((x) => x.id === p.photoId);
    if (ph) delete ph.up;
  });
}

let draining = false;
let retryT: ReturnType<typeof setTimeout> | undefined;
let warnedSql = false;
/** 사진들을 올린다. 실패한 건 이 폰에 남겨두고 나중에 다시. */
export async function queuePhotos(tripId: string, memoId: string, list: Prepared[], onErr?: (m: string) => void) {
  const items: Pending[] = list.filter((x) => x.photo.path).map((x) => ({ path: x.photo.path!, tripId, memoId, photoId: x.photo.id, full: x.full, thumb: x.thumb }));
  for (const it of items) await idb('readwrite', (s) => s.put(it)).catch(() => {});
  await drainPhotos(onErr, items);
}
export async function drainPhotos(onErr?: (m: string) => void, mem?: Pending[]) {
  if (!supabase || draining) return;
  draining = true;
  try {
    const list = mem?.length ? mem : await idb<Pending[]>('readonly', (s) => s.getAll()).catch(() => [] as Pending[]);
    for (const p of list) {
      try {
        await send(p);
        markUp(p);
        await idb('readwrite', (s) => s.delete(p.path)).catch(() => {});
      } catch (e) {
        const m = String((e as { message?: string })?.message ?? e);
        if (/bucket not found|row-level security|not found/i.test(m) && !warnedSql) {
          warnedSql = true;
          onErr?.('사진은 이 폰에 두었어요. 서버 설정(SQL)을 한 번 해야 올라가요.');
        } else if (!/bucket|security/i.test(m)) onErr?.('인터넷이 약해서 사진은 이 폰에 두었어요. 연결되면 올라가요.');
        clearTimeout(retryT);
        retryT = setTimeout(() => void drainPhotos(), 60000);
        break;
      }
    }
  } finally {
    draining = false;
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void drainPhotos());
  setTimeout(() => void drainPhotos(), 4000);
}

/** 기록을 지울 때 서버의 사진도 지운다 (실패해도 그냥 둠) */
export function removePhotos(photos: Photo[]) {
  const paths = photos.flatMap((p) => (p.path ? [p.path, thumbPath(p.path)] : []));
  if (!paths.length || !supabase) return;
  void supabase.storage.from(BUCKET).remove(paths);
  for (const p of photos) if (p.path) void idb('readwrite', (s) => s.delete(p.path!)).catch(() => {});
}

/* ---------- 보여주기 ---------- */
/** 방금 고른 사진 (이 폰에 있는 그림) */
const local = new Map<string, string>();
const SIGN_KEY = 'our-trip:signed';
const DAY = 864e5;
let signed: Record<string, [string, number]> = {};
try {
  signed = JSON.parse(localStorage.getItem(SIGN_KEY) || '{}');
} catch {}
const want = new Set<string>();
const waiters = new Map<string, Set<() => void>>();
let tick: ReturnType<typeof setTimeout> | undefined;

function askSign(path: string, cb: () => void) {
  want.add(path);
  if (!waiters.has(path)) waiters.set(path, new Set());
  waiters.get(path)!.add(cb);
  clearTimeout(tick);
  tick = setTimeout(signNow, 30);
  return () => {
    waiters.get(path)?.delete(cb);
  };
}
async function signNow() {
  if (!supabase) return;
  const paths = [...want];
  want.clear();
  for (let i = 0; i < paths.length; i += 100) {
    const part = paths.slice(i, i + 100);
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(part, 7 * 86400);
    for (const d of data ?? []) if (d.signedUrl && d.path) signed[d.path] = [d.signedUrl, Date.now() + 6 * DAY];
    for (const p of part) waiters.get(p)?.forEach((f) => f());
  }
  const now = Date.now();
  for (const k of Object.keys(signed)) if (signed[k][1] < now) delete signed[k];
  try {
    localStorage.setItem(SIGN_KEY, JSON.stringify(signed));
  } catch {}
}
function cached(path: string): string | undefined {
  const s = signed[path];
  return s && s[1] > Date.now() ? s[0] : undefined;
}

/** 사진 주소. big = 원본 크기 */
export function usePhotoUrl(p: Photo | undefined, big = false): string | undefined {
  const path = p?.path ? (big ? p.path : thumbPath(p.path)) : undefined;
  const mine = path ? local.get(big ? p!.path + '#full' : p!.path!) : undefined;
  const [, bump] = useState(0);
  const url = p?.src ?? mine ?? (path ? cached(path) : undefined);
  useEffect(() => {
    if (!path || url || p?.up) return;
    return askSign(path, () => bump((n) => n + 1));
  }, [path, url, p?.up]);
  return url;
}

/** 찍은 시각 → 여행 날짜 (여행 기간 안일 때만) */
export function photoDay(photos: Photo[], days: string[]): string | undefined {
  const c = new Map<string, number>();
  for (const p of photos) {
    const d = p.at?.slice(0, 10);
    if (d && days.includes(d)) c.set(d, (c.get(d) ?? 0) + 1);
  }
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
