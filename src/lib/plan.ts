import type { Booking, Cat, Geo, PlanItem, Stop, Trip, Wish } from './types';
import { daysOf, mins, uid } from './utils';
import { AIRPORT_CITY, COUNTRY } from './constants';

/** 종류별 기본 머무는 시간(분) */
export const DEFAULT_STAY: Record<Cat, number> = { flight: 0, stay: 30, food: 60, move: 0, sight: 90, shop: 60, etc: 60, station: 10, bus: 10 };
/** 머무는 시간. 따로 안 적었으면 함께 들르는 곳(곳마다 40분 + 그 사이 걷기)도 더해서 */
export const stayOf = (p: PlanItem) => p.stay ?? DEFAULT_STAY[p.type] + innerMin(p);

/** 함께 들르는 곳을 도는 데 드는 시간(분): 곳마다 40분 + 그 사이 이동 */
export function innerMin(p: Pick<PlanItem, 'geo' | 'stops'>): number {
  const st = p.stops ?? [];
  if (!st.length) return 0;
  let m = st.length * 40, at = p.geo ?? null;
  for (const x of st) {
    if (at && x.geo) m += estMin(at, x.geo);
    if (x.geo) at = x.geo;
  }
  return m;
}

/** 이 일정을 마치고 나오는 곳 (마지막으로 들른 곳) */
export const exitGeo = (p: PlanItem): Geo | null | undefined => [...(p.stops ?? [])].reverse().find((x) => x.geo)?.geo ?? p.geo;

/** 함께 들르는 곳을 걷는 거리가 가장 짧은 순서로 (위치 모르는 곳은 맨 뒤 그대로) */
export function orderStops(from: Geo | null | undefined, stops: Stop[]): Stop[] {
  const g = stops.filter((x) => x.geo), rest = stops.filter((x) => !x.geo);
  if (g.length < 2) return [...g, ...rest];
  const len = (o: Stop[]) => o.reduce((s, x, i) => s + km(i ? o[i - 1].geo! : (from ?? x.geo!), x.geo!), 0);
  let best = g, bestLen = len(g);
  if (g.length <= 7) {
    const rec = (done: Stop[], left: Stop[]) => {
      if (!left.length) {
        const l = len(done);
        if (l < bestLen - 1e-9) {
          bestLen = l;
          best = done;
        }
        return;
      }
      left.forEach((x, i) => rec([...done, x], left.filter((_, j) => j !== i)));
    };
    rec([], g);
  } else {
    // 많으면 가장 가까운 곳부터
    const left = [...g];
    const out: Stop[] = [];
    let at = from ?? left[0].geo!;
    while (left.length) {
      left.sort((a, b) => km(at, a.geo!) - km(at, b.geo!));
      const x = left.shift()!;
      out.push(x);
      at = x.geo!;
    }
    best = out;
  }
  return [...best, ...rest];
}

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
  if (prev) return hhmm(Math.min(23 * 60 + 30, mins(prev.time) + stayOf(prev) + estMin(exitGeo(prev), geo)));
  // 맨 앞에 넣을 땐 너무 이른 아침이 되지 않게 (뒤 일정은 reflow가 민다)
  if (next) return hhmm(Math.max(Math.min(DAY_START, mins(next.time)), mins(next.time) - stay - estMin(geo, next.geo)));
  return hhmm(DAY_START);
}

function fromWish(w: Wish, date: string): PlanItem {
  return { id: uid(), date, time: '10:00', type: w.type, title: w.title, note: w.note, place: w.place, travel: null, geo: w.geo ?? null };
}

/** 새로 끼운 뒤 뒤쪽 일정이 겹치면 고정 아닌 것만 뒤로 민다 */
function reflow(t: Trip, seq: PlanItem[]) {
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    const earliest = mins(a.time) + stayOf(a) + (b.travel?.min ?? estMin(exitGeo(a), b.geo));
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
  const ws = t.wish.filter((x) => x.planId === id);
  ws.forEach((w) => (w.planId = null));
  // 함께 들르던 곳 중 담아둔 장소에 없던 곳도 되돌림
  for (const s of it.stops ?? []) if (!s.wishId || !t.wish.some((w) => w.id === s.wishId)) t.wish.unshift({ id: uid(), title: s.name, type: s.type ?? 'sight', url: '', place: s.name, note: '', planId: null, geo: s.geo ?? null });
  if (!ws.some((w) => !it.stops?.some((s) => s.wishId === w.id))) t.wish.unshift({ id: uid(), title: it.title, type: it.type, url: '', place: it.place, note: it.note, planId: null, geo: it.geo ?? null });
}

/** 그날 동선에서 이동이 가장 덜 늘어나는 자리 */
export function bestPos(seq: PlanItem[], geo?: Geo | null, edge: { first?: boolean; last?: boolean } = {}): number {
  let pos = seq.length, add = Infinity;
  for (let i = 0; i <= seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    if (i === 0 && b?.type === 'flight' && !edge.last) continue; // 도착 비행기 앞에는 안 넣음
    if (edge.first && !edge.last && seq.slice(i).some((x) => x.type === 'flight')) continue; // 첫날은 타고 가는 비행기 앞(출발 전)에 안 넣음
    if (i === seq.length && a?.type === 'stay' && seq.length > 1) continue; // 숙소 들어간 뒤로는 안 보냄
    if (edge.last && seq.slice(0, i).some((x) => x.type === 'flight')) continue; // 마지막 날 돌아가는 비행기 뒤로는 안 넣음
    const inc = (a ? estMin(exitGeo(a), geo) : 0) + (b ? estMin(geo, b.geo) : 0) - (a && b ? estMin(exitGeo(a), b.geo) : 0);
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
  return w ? placeWish(t, wishId, date, bestPos(dayItems(t, date), w.geo, { first: daysOf(t)[0] === date, last: daysOf(t).at(-1) === date })) : null;
}

/**
 * 담아둔 장소를 여행 전체 날짜에 고르게 자동 배치.
 * 1) 날마다 몇 곳 넣을지 정한다: 원래 일정까지 합쳐 하루하루 비슷하게, 비행기 있는 날은 절반만.
 * 2) 담아둔 곳을 가까운 곳끼리 한 줄로 잇고(가장 가까운 곳 따라가기), 그 줄을 날 순서대로 잘라 나눈다.
 * 3) 그날 동선에서 이동이 가장 적게 늘어나는 자리에 끼워 넣는다.
 */
export function autoPlace(t: Trip, ids?: string[]): number {
  const todo = unplaced(t).filter((w) => !ids || ids.includes(w.id));
  if (!todo.length) return 0;
  const ds = daysOf(t);
  // 비행기는 따로(그날은 절반만 채움) 보고 나머지 일정 수를 센다
  const load = ds.map((d) => dayItems(t, d).filter((p) => p.type !== 'flight').length);
  const weight = ds.map((d) => (t.plan.some((p) => p.date === d && p.type === 'flight') ? 0.5 : 1));
  // 1) 날마다 넣을 개수: (원래 + 새로) ÷ 그날 여유가 가장 작은 날에 하나씩
  const quota = ds.map(() => 0);
  for (let i = 0; i < todo.length; i++) {
    let k = 0;
    for (let j = 1; j < ds.length; j++) if ((load[j] + quota[j] + 1) / weight[j] < (load[k] + quota[k] + 1) / weight[k] - 1e-9) k = j;
    quota[k]++;
  }
  // 2) 가까운 곳끼리 잇기. 첫날 일정(공항·숙소 등)과 가장 가까운 곳에서 시작
  const geoOf = (d: string) => t.plan.filter((p) => p.date === d && p.geo).map((p) => p.geo!);
  const firstGeo = ds.map(geoOf).find((g) => g.length)?.[0];
  const left = todo.filter((w) => w.geo);
  const chain: Wish[] = [];
  if (left.length) {
    let at: Geo = firstGeo ?? left.reduce((m, w) => (w.geo!.lng < m.lng ? w.geo! : m), left[0].geo!);
    while (left.length) {
      let bi = 0;
      for (let i = 1; i < left.length; i++) if (km(at, left[i].geo!) < km(at, left[bi].geo!)) bi = i;
      const w = left.splice(bi, 1)[0];
      chain.push(w);
      at = w.geo!;
    }
  }
  chain.push(...todo.filter((w) => !w.geo));
  // 3) 날 순서대로 잘라서 넣기
  let n = 0;
  ds.forEach((date, k) => {
    for (const w of chain.splice(0, quota[k])) {
      placeWish(t, w.id, date, bestPos(dayItems(t, date), w.geo, { first: k === 0, last: k === ds.length - 1 }));
      n++;
    }
  });
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

/**
 * 장소 검색 기준 위치. 도착 공항의 도시를 기준으로, 그 근처(여행지)에 찍힌 장소들의 가운데.
 * 인천공항처럼 한국에 찍힌 일정은 빼서 검색이 한국 쪽으로 끌려가지 않게 한다.
 */
export function tripCenter(t: Trip): [number, number] {
  const a = AIRPORT_CITY[(t.to || '').toUpperCase()] ?? COUNTRY[t.country].center;
  const anchor = { lat: a[0], lng: a[1] };
  const near = [...t.plan.filter((p) => p.type !== 'flight'), ...t.wish]
    .map((x) => x.geo)
    .filter((g): g is Geo => !!g && km(anchor, g) < 600);
  if (!near.length) return a;
  const mid = (xs: number[]) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)];
  return [mid(near.map((g) => g.lat)), mid(near.map((g) => g.lng))];
}
