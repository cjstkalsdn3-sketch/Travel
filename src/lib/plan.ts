import type { Booking, Cat, Geo, PlanItem, Trip, Wish } from './types';
import { daysOf, mins, uid } from './utils';

/** 종류별 기본 머무는 시간(분) */
export const DEFAULT_STAY: Record<Cat, number> = { flight: 0, stay: 30, food: 60, move: 0, sight: 90, shop: 60, etc: 60, station: 10, bus: 10 };
export const stayOf = (p: PlanItem) => p.stay ?? DEFAULT_STAY[p.type];

export const bookingOf = (t: Trip, p: PlanItem): Booking | undefined => t.book.find((b) => b.date === p.date && b.time === p.time);

/** 동선 정리 때 움직이지 않는 일정 */
export const isFixed = (t: Trip, p: PlanItem) => p.fixed ?? (p.type === 'flight' || p.type === 'stay' || !!bookingOf(t, p));

/** 하루 일정을 보여줄 순서대로. 직접 순서를 바꾼 날은 ord, 아니면 시간 순 */
export function dayItems(t: Trip, date: string): PlanItem[] {
  const items = t.plan.filter((p) => p.date === date);
  const ordered = items.some((p) => p.ord !== undefined);
  return items.sort((a, b) => {
    if (ordered) {
      const d = (a.ord ?? Infinity) - (b.ord ?? Infinity);
      if (d) return d;
    }
    return a.time.localeCompare(b.time);
  });
}

/** 새 일정을 넣을 때 ord: 시간상 들어갈 자리의 앞뒤 사이 값 (그날이 ord를 쓸 때만) */
export function ordForInsert(t: Trip, date: string, time: string, exceptId?: string): number | undefined {
  const items = dayItems(t, date).filter((p) => p.id !== exceptId);
  if (!items.some((p) => p.ord !== undefined)) return undefined;
  const ords = items.map((p, i) => p.ord ?? i * 1000);
  let k = items.length;
  for (let i = 0; i < items.length; i++) {
    if (mins(items[i].time) > mins(time)) {
      k = i;
      break;
    }
  }
  const prev = k > 0 ? ords[k - 1] : ords[0] - 1000;
  const next = k < items.length ? ords[k] : prev + 2000;
  return (prev + next) / 2;
}

/** 순서를 그대로 ord로 기록 */
export function writeOrder(t: Trip, idsInOrder: string[]) {
  idsInOrder.forEach((id, i) => {
    const p = t.plan.find((x) => x.id === id);
    if (p) p.ord = i * 1000;
  });
}

export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

/* ---------------- 동선 최적화 ---------------- */

/** cost[i][j] = i → j 이동 분, 모르면 Infinity */
export type Matrix = number[][];

function pathCost(order: number[], cost: Matrix): number {
  let s = 0;
  for (let i = 1; i < order.length; i++) {
    const c = cost[order[i - 1]][order[i]];
    s += Number.isFinite(c) ? c : 0;
  }
  return s;
}

/**
 * fixedPos[i] = true 이면 i번째 자리는 그대로. 나머지 자리에 나머지 일정을 가장 짧은 이동이 되게 배치.
 * 반환: 새 순서 (원래 인덱스들)
 */
export function optimize(n: number, fixedPos: boolean[], cost: Matrix): number[] {
  const base = Array.from({ length: n }, (_, i) => i);
  const freeSlots = base.filter((i) => !fixedPos[i]);
  const free = [...freeSlots];
  if (free.length < 2) return base;
  const place = (perm: number[]) => {
    const o = [...base];
    freeSlots.forEach((slot, k) => (o[slot] = perm[k]));
    return o;
  };
  let best = place(free);
  let bestCost = pathCost(best, cost);
  if (free.length <= 7) {
    const perm = [...free];
    const rec = (k: number) => {
      if (k === perm.length) {
        const o = place(perm);
        const c = pathCost(o, cost);
        if (c < bestCost - 1e-9) {
          bestCost = c;
          best = o;
        }
        return;
      }
      for (let i = k; i < perm.length; i++) {
        [perm[k], perm[i]] = [perm[i], perm[k]];
        rec(k + 1);
        [perm[k], perm[i]] = [perm[i], perm[k]];
      }
    };
    rec(0);
    return best;
  }
  // 많을 땐 자리 맞바꾸기를 더 나아지지 않을 때까지 반복
  let perm = [...free];
  let improved = true;
  while (improved) {
    improved = false;
    for (let a = 0; a < perm.length; a++)
      for (let b = a + 1; b < perm.length; b++) {
        const p2 = [...perm];
        [p2[a], p2[b]] = [p2[b], p2[a]];
        const c = pathCost(place(p2), cost);
        if (c < bestCost - 1e-9) {
          bestCost = c;
          perm = p2;
          best = place(p2);
          improved = true;
        }
      }
  }
  return best;
}

export { pathCost };

/* ---------------- 담아둔 장소 ↔ 일정 ---------------- */


/** 두 위치 사이 직선거리(km) */
export function km(a: Geo, b: Geo): number {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 대충 걸리는 이동 시간(분). 정확한 값은 동선 정리에서 구글로 다시 계산 */
export function estMin(a?: Geo | null, b?: Geo | null): number {
  if (!a || !b) return 20;
  const d = km(a, b);
  if (d < 1.2) return Math.max(5, Math.round((d * 1000) / 75 / 5) * 5); // 걷기
  return Math.round((12 + d * 2.2) / 5) * 5; // 대중교통
}

/** 아직 일정에 안 들어간 가볼 곳 */
export const unplaced = (t: Trip): Wish[] => t.wish.filter((w) => !w.planId || !t.plan.some((p) => p.id === w.planId));

const DAY_START = 10 * 60;

/** 끼워 넣을 자리 앞뒤를 보고 시간 정하기 */
function timeAt(seq: PlanItem[], idx: number, geo: Geo | null | undefined, stay: number): string {
  const prev = seq[idx - 1], next = seq[idx];
  if (prev) return hhmm(Math.min(23 * 60 + 30, mins(prev.time) + stayOf(prev) + estMin(prev.geo, geo)));
  if (next) return hhmm(Math.max(7 * 60, mins(next.time) - stay - estMin(geo, next.geo)));
  return hhmm(DAY_START);
}

function fromWish(w: Wish, date: string): PlanItem {
  return { id: uid(), date, time: '10:00', type: w.type, title: w.title, note: w.note, place: w.place, travel: null, geo: w.geo ?? null };
}

/** 새로 끼운 뒤 뒤쪽 일정이 겹치면 고정 아닌 것만 뒤로 민다 */
function reflow(t: Trip, seq: PlanItem[]) {
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    const earliest = mins(a.time) + stayOf(a) + (b.travel?.min ?? estMin(a.geo, b.geo));
    if (mins(b.time) < earliest && !isFixed(t, b) && earliest < 24 * 60) {
      b.time = hhmm(Math.ceil(earliest / 5) * 5);
      delete b.wx;
    }
  }
}

/** 가볼 곳을 그날 idx번째 자리에 넣는다. 놓은 자리가 그대로 보이게 그날 순서를 기록 */
export function placeWish(t: Trip, wishId: string, date: string, idx: number): PlanItem | null {
  const w = t.wish.find((x) => x.id === wishId);
  if (!w) return null;
  const seq = dayItems(t, date);
  const k = Math.max(0, Math.min(idx, seq.length));
  const it = fromWish(w, date);
  it.time = timeAt(seq, k, it.geo, stayOf(it));
  t.plan.push(it);
  seq.splice(k, 0, it);
  // 바로 뒤 일정은 출발지가 바뀌어서 이전 이동 시간이 안 맞음
  if (seq[k + 1]) seq[k + 1].travel = null;
  writeOrder(t, seq.map((p) => p.id));
  reflow(t, seq);
  w.planId = it.id;
  return it;
}

/** 일정 안에서 자리 옮기기 (다른 날로도) */
export function movePlan(t: Trip, id: string, date: string, idx: number) {
  const it = t.plan.find((p) => p.id === id);
  if (!it) return;
  const seq = dayItems(t, date).filter((p) => p.id !== id);
  const k = Math.max(0, Math.min(idx, seq.length));
  if (it.date !== date || !isFixed(t, it)) {
    it.time = timeAt(seq, k, it.geo, stayOf(it));
    delete it.wx;
  }
  it.date = date;
  it.travel = null;
  seq.splice(k, 0, it);
  if (seq[k + 1]) seq[k + 1].travel = null;
  writeOrder(t, seq.map((p) => p.id));
  reflow(t, seq);
}

/** 일정에서 빼서 담아둔 장소로 되돌림 */
export function unplan(t: Trip, id: string) {
  const it = t.plan.find((p) => p.id === id);
  if (!it) return;
  t.plan = t.plan.filter((p) => p.id !== id);
  const w = t.wish.find((x) => x.planId === id);
  if (w) w.planId = null;
  else t.wish.unshift({ id: uid(), title: it.title, type: it.type, url: '', place: it.place, note: it.note, planId: null, geo: it.geo ?? null });
}

/** 그날 동선에서 이동이 가장 덜 늘어나는 자리 */
export function bestPos(seq: PlanItem[], geo?: Geo | null): number {
  let pos = seq.length, add = Infinity;
  for (let i = 0; i <= seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    if (i === 0 && b?.type === 'flight') continue; // 도착 비행기 앞에는 안 넣음
    if (i === seq.length && a?.type === 'stay' && seq.length > 1) continue; // 숙소 들어간 뒤로는 안 보냄
    const inc = (a ? estMin(a.geo, geo) : 0) + (b ? estMin(geo, b.geo) : 0) - (a && b ? estMin(a.geo, b.geo) : 0);
    if (inc < add) {
      add = inc;
      pos = i;
    }
  }
  return pos;
}

/** 그날 가장 알맞은 자리에 넣기 */
export function placeBest(t: Trip, wishId: string, date: string): PlanItem | null {
  const w = t.wish.find((x) => x.id === wishId);
  return w ? placeWish(t, wishId, date, bestPos(dayItems(t, date), w.geo)) : null;
}

/**
 * 담아둔 장소를 날짜별로 자동 배치.
 * 그날 이미 있는 일정과 가까운 날로 보내고, 하루가 너무 꽉 차지 않게 나눈 뒤
 * 그날 동선에서 이동이 가장 적게 늘어나는 자리에 끼워 넣는다.
 */
export function autoPlace(t: Trip, ids?: string[]): number {
  const todo = unplaced(t).filter((w) => !ids || ids.includes(w.id));
  if (!todo.length) return 0;
  const ds = daysOf(t);
  const load = ds.map((d) => dayItems(t, d).length);
  const hasFlight = ds.map((d) => t.plan.some((p) => p.date === d && p.type === 'flight'));
  const pts = ds.map((d) => t.plan.filter((p) => p.date === d && p.geo).map((p) => p.geo!) as Geo[]);
  const center = (g: Geo[]) => (g.length ? { lat: g.reduce((s, x) => s + x.lat, 0) / g.length, lng: g.reduce((s, x) => s + x.lng, 0) / g.length } : null);
  // 위치 있는 곳 먼저, 서로 가까운 것끼리 묶이게 위도·경도 순으로
  const order = [...todo].sort((a, b) => (a.geo ? 0 : 1) - (b.geo ? 0 : 1) || (a.geo && b.geo ? a.geo.lng + a.geo.lat - (b.geo.lng + b.geo.lat) : 0));
  const perDay = Math.max(3, Math.ceil((load.reduce((s, x) => s + x, 0) + todo.length) / ds.length) + 1);
  let n = 0;
  for (const w of order) {
    let best = -1, bestScore = Infinity;
    ds.forEach((_, k) => {
      const c = center(pts[k]);
      const dist = w.geo && c ? km(w.geo, c) : 4;
      const score = dist + load[k] * 1.2 + (hasFlight[k] ? 4 : 0) + (load[k] >= perDay ? 50 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    });
    const date = ds[best];
    const pos = bestPos(dayItems(t, date), w.geo);
    placeWish(t, w.id, date, pos);
    load[best]++;
    if (w.geo) pts[best].push(w.geo);
    n++;
  }
  return n;
}

/* ---------- 일정 안 (A안·B안) ---------- */
const ABC = 'ABCDEFGHIJ';
export const altNameOf = (t: Trip) => t.altName || 'A안';
/** 모든 안 */
export function allAlts(t: Trip): { id: string; name: string; count: number; on: boolean }[] {
  const cur = { id: t.altId || 'base', name: altNameOf(t), count: t.plan.length, on: true };
  const rest = (t.alts ?? []).map((a) => ({ id: a.id, name: a.name, count: a.plan.length, on: false }));
  // 만든 순서대로 (id가 시간 순)
  return [cur, ...rest].sort((a, b) => (a.id === 'base' ? -1 : b.id === 'base' ? 1 : a.id < b.id ? -1 : 1));
}
function nextName(t: Trip) {
  const used = new Set([altNameOf(t), ...(t.alts ?? []).map((a) => a.name)]);
  for (const c of ABC) if (!used.has(c + '안')) return c + '안';
  return `${used.size + 1}번째 안`;
}
const linksOf = (t: Trip) => Object.fromEntries(t.wish.filter((w) => w.planId && t.plan.some((p) => p.id === w.planId)).map((w) => [w.id, w.planId!]));
/** 지금 안을 보관함에 넣기 */
function stash(t: Trip) {
  t.altId ||= uid();
  (t.alts ??= []).push({ id: t.altId, name: altNameOf(t), plan: t.plan, links: linksOf(t) });
}
function load(t: Trip, a: { id: string; name: string; plan: PlanItem[]; links: Record<string, string> }) {
  t.altId = a.id;
  t.altName = a.name;
  t.plan = a.plan;
  const ids = new Set(a.plan.map((p) => p.id));
  for (const w of t.wish) {
    const pid = a.links[w.id];
    w.planId = pid && ids.has(pid) ? pid : null;
  }
}
/** 새 안 만들고 바로 그 안으로. copy=false면 항공·숙소처럼 고정된 일정만 가져감 */
export function newAlt(t: Trip, copy: boolean): string {
  const name = nextName(t);
  const plan = (copy ? t.plan : t.plan.filter((p) => isFixed(t, p))).map((p) => ({ ...p }));
  const links = copy ? linksOf(t) : {};
  stash(t);
  load(t, { id: uid(), name, plan, links });
  return name;
}
export function switchAlt(t: Trip, id: string) {
  const a = t.alts?.find((x) => x.id === id);
  if (!a) return;
  t.alts = t.alts!.filter((x) => x.id !== id);
  stash(t);
  load(t, a);
}
export function renameAlt(t: Trip, id: string, name: string) {
  name = name.trim();
  if (!name) return;
  if (id === (t.altId || 'base')) t.altName = name;
  else {
    const a = t.alts?.find((x) => x.id === id);
    if (a) a.name = name;
  }
}
/** 지금 안 쓰는 안만 지울 수 있음 */
export function deleteAlt(t: Trip, id: string) {
  t.alts = (t.alts ?? []).filter((x) => x.id !== id);
}
