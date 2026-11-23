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

/* ---------------- 자동 배치 ---------------- */
/** 역·정류장 기준으로 묶을 거리: 걸어서 30분쯤 */
const NEAR_KM = 2.2;
/** 묶음 하나가 넘지 않을 시간 (넘으면 같은 역으로 두 번 나눔) */
const GROUP_MAX = 360;
/** 한 지역으로 볼 거리 (서로 이만큼 안으로 이어지면 같은 지역) */
const REGION_KM = 15;
/** 하루에 돌 수 있는 시간 */
const FULL_DAY = 540;
/** 하루를 통째로 쓰는 곳 (테마파크) */
const WHOLE_DAY = /유니버(설|셜)|universal|USJ|디즈니|disney|레고랜드|legoland|후지큐|fuji-?q|에버랜드|롯데월드|시월드|seaworld|six flags|식스 ?플래그/i;
const isWholeDay = (w: Pick<Wish, 'title' | 'place'>) => WHOLE_DAY.test(`${w.title} ${w.place}`);
/** 공항 일정: 항공으로 적었거나, 이름·장소에 공항이 들어간 일정 ("고베 공항 (UKB)") */
const isPort = (p: PlanItem) => p.type === 'flight' || /공항|airport|空港|\([A-Z]{3}\)/i.test(`${p.title} ${p.place}`);
const DAY_FROM = 9 * 60 + 30, DAY_TO = 21 * 60;
/** 비행기 앞뒤로 비워둘 시간: 내려서 입국·이동, 타기 전 공항 도착 */
const AFTER_LANDING = 240, BEFORE_TAKEOFF = 180; // 일정의 비행기 시각은 출발 시각이라 비행시간까지 넉넉히
const MEALS: [number, number][] = [[11 * 60 + 30, 14 * 60], [17 * 60 + 30, 20 * 60 + 30]];

interface Slot {
  it: PlanItem;
  isNew: boolean;
  fixed: boolean;
  u?: Unit;
}

/**
 * 그날 순서대로 시간을 매겨 본다.
 * 새로 넣는 곳은 앞 일정이 끝나고 이동한 뒤 바로, 원래 있던 곳은 원래 시간보다 당겨지지 않게,
 * 고정된 일정(항공·숙소·예약)은 그대로. 반환: 각 시작 시각과 벌점(작을수록 좋은 하루).
 */
function simulate(seq: Slot[], edge: { first?: boolean; last?: boolean } = {}): { at: number[]; bad: number } {
  const at: number[] = [];
  let bad = 0, end = -1;
  let prev: Slot | null = null;
  for (const s of seq) {
    const p = s.it;
    let start: number;
    if (!prev) start = s.isNew ? DAY_FROM : mins(p.time);
    else {
      const gap = p.type === 'flight' ? estMin(exitGeo(prev.it), p.geo) + BEFORE_TAKEOFF - 60 : estMin(exitGeo(prev.it), p.geo);
      const ready = end + (prev.it.type === 'flight' ? AFTER_LANDING : gap);
      start = s.isNew ? Math.max(ready, DAY_FROM) : Math.max(ready, mins(p.time));
      if (s.fixed && ready > mins(p.time)) {
        start = mins(p.time);
        bad += 1000 + (ready - start) * 10; // 고정 일정에 늦음
      }
    }
    // 첫날 한국에서 비행기 타기 전, 마지막 날 돌아가는 비행기 뒤에는 넣지 않음
    // (항공이 아니라 '기타'로 적은 공항 일정도 공항으로 봄. 첫날 공항 일정이 없으면 그날 첫 일정 전에는 안 넣음)
    if (s.isNew && edge.first && !edge.last) {
      const after = seq.slice(seq.indexOf(s) + 1);
      if (seq.some((x) => isPort(x.it)) ? after.some((x) => isPort(x.it)) : !seq.slice(0, seq.indexOf(s)).some((x) => !x.isNew)) bad += 5000;
    }
    if (s.isNew && edge.last && !edge.first && seq.slice(0, seq.indexOf(s)).some((x) => isPort(x.it))) bad += 5000;
    if (s.isNew) {
      const fin = start + stayOf(p);
      if (fin > DAY_TO) bad += (fin - DAY_TO) * 4; // 너무 늦게까지
      if (p.type === 'food') {
        const off = Math.min(...MEALS.map(([a, b]) => (start < a ? a - start : start > b ? start - b : 0)));
        bad += off * 1.5; // 밥 먹을 때가 아님
        if (prev?.it.type === 'food') bad += 90; // 밥 먹고 바로 또 밥
      }
    } else if (!s.fixed && start > mins(p.time)) bad += (start - mins(p.time)) * 2; // 원래 일정이 밀림
    at.push(start);
    end = start + stayOf(p);
    prev = s;
  }
  // 이동 시간도 조금 (가까운 곳끼리 붙게)
  for (let i = 1; i < seq.length; i++) bad += estMin(exitGeo(seq[i - 1].it), seq[i].it.geo) * 0.8;
  return { at, bad };
}

/** 일정에 한 칸으로 들어갈 묶음: 역 하나 + 그 근처 장소들(함께 들를 곳), 또는 장소 하나 */
interface Unit {
  head: Wish;
  /** 역 묶음일 때 함께 들를 곳 */
  members?: Wish[];
  /** 같은 역을 두 번째 묶음에 또 쓸 때는 역을 담아둔 곳과 연결하지 않음 */
  headLinked: boolean;
  geo?: Geo | null;
}

/**
 * 담아둔 장소를 여행 전체 날짜에 나눠 넣는다.
 * - 고정된 일정(항공·숙소·예약)은 절대 안 움직이고, 그 사이 빈 시간에만 넣는다.
 * - 공항은 일정의 비행기에, 숙소는 일정의 숙소에 이어 붙인다. 숙소 일정이 없으면 첫날 체크인으로 넣는다.
 * - 역·정류장은 걸어서 30분 안의 담아둔 곳을 함께 들를 곳으로 묶어 한 칸으로 넣는다 (밥집은 밥때 맞추려고 따로).
 * - 날마다 남은 시간에 맞게, 가까운 묶음끼리 같은 날로 나눈다. 테마파크는 빈 날 하루 통째로.
 * - 그날 안에서는 시간을 매겨 보며 이동이 짧고 밥때가 맞고 늦게 끝나지 않는 자리에. 고정 일정에 늦게 되면 안 넣는다.
 * 시간이 모자라 못 넣은 곳은 담아둔 곳에 그대로 둔다.
 */
export function autoPlace(t: Trip, ids?: string[]): { n: number; left: number; skipped: number } {
  const all = unplaced(t).filter((w) => !ids || ids.includes(w.id));
  const ds = daysOf(t);
  if (!all.length || !ds.length) return { n: 0, left: all.length, skipped: 0 };
  let n = 0, skipped = 0;

  // 공항·숙소: 일정에 있는 비행기·숙소에 이어 붙임
  const nearest = (w: Wish, list: PlanItem[]) => [...list].sort((a, b) => (w.geo && a.geo ? km(w.geo, a.geo) : 99) - (w.geo && b.geo ? km(w.geo, b.geo) : 99))[0];
  for (const w of all.filter((x) => x.type === 'flight')) {
    const f = nearest(w, t.plan.filter((p) => p.type === 'flight'));
    if (f) {
      w.planId = f.id;
      if (!f.geo && w.geo) f.geo = w.geo;
      n++;
    } else skipped++;
  }
  for (const w of all.filter((x) => x.type === 'stay')) {
    const h = nearest(w, t.plan.filter((p) => p.type === 'stay'));
    if (h && (!w.geo || !h.geo || km(w.geo, h.geo) < 1)) {
      w.planId = h.id;
      if (!h.geo && w.geo) h.geo = w.geo;
      n++;
    } else {
      // 숙소 일정이 없으면 첫날 오후 체크인으로
      const it = fromWish(w, ds[0]);
      it.time = '15:00';
      it.title = `${w.title} 체크인`;
      t.plan.push(it);
      writeOrder(t, [...dayItems(t, ds[0]).filter((p) => p.id !== it.id && mins(p.time) <= 15 * 60).map((p) => p.id), it.id, ...dayItems(t, ds[0]).filter((p) => p.id !== it.id && mins(p.time) > 15 * 60).map((p) => p.id)]);
      w.planId = it.id;
      n++;
    }
  }

  // 역 묶음 만들기
  const rest = all.filter((w) => !w.planId && w.type !== 'flight' && w.type !== 'stay' && w.type !== 'move');
  const hubs = rest.filter((w) => (w.type === 'station' || w.type === 'bus') && w.geo);
  const units: Unit[] = [];
  const grouped = new Set<string>();
  const byHub = new Map<string, Wish[]>();
  for (const w of rest) {
    if (w.type === 'station' || w.type === 'bus' || w.type === 'food' || !w.geo || isWholeDay(w)) continue;
    let best: Wish | null = null;
    for (const h of hubs) if (km(h.geo!, w.geo) <= NEAR_KM && (!best || km(h.geo!, w.geo) < km(best.geo!, w.geo))) best = h;
    if (best) {
      byHub.set(best.id, [...(byHub.get(best.id) ?? []), w]);
      grouped.add(w.id);
    }
  }
  for (const h of hubs) {
    const ms = byHub.get(h.id) ?? [];
    const ordered = orderStops(h.geo, ms.map((w) => ({ id: w.id, name: w.title, geo: w.geo, type: w.type, wishId: w.id }))).map((s) => ms.find((w) => w.id === s.wishId)!);
    let cur: Wish[] = [], acc = 0, first = true;
    const flush = () => {
      units.push({ head: h, members: cur, headLinked: first, geo: h.geo });
      first = false;
      cur = [];
      acc = 0;
    };
    for (const w of ordered) {
      if (acc + 50 > GROUP_MAX && cur.length) flush();
      cur.push(w);
      acc += 50;
    }
    flush();
  }
  for (const w of rest) if (!grouped.has(w.id) && w.type !== 'station' && w.type !== 'bus') units.push({ head: w, headLinked: true, geo: w.geo });
  for (const w of rest) if ((w.type === 'station' || w.type === 'bus') && !w.geo) units.push({ head: w, headLinked: true, geo: null });

  const toItem = (u: Unit, date: string): PlanItem => {
    const it = fromWish(u.head, date);
    if (u.members?.length) it.stops = u.members.map((w) => ({ id: uid(), name: w.title, geo: w.geo ?? null, type: w.type, wishId: w.id }));
    if (isWholeDay(u.head)) it.stay = 540;
    return it;
  };
  const cost = (u: Unit) => (isWholeDay(u.head) ? 600 : stayOf(toItem(u, ds[0])) + 25);
  const isFood = (u: Unit) => u.head.type === 'food' && !u.members?.length;

  // 날마다 쓸 수 있는 시간
  const free = ds.map((d, k) => {
    const items = dayItems(t, d);
    let from = DAY_FROM, to = DAY_TO;
    const ports = items.filter(isPort);
    const first = k === 0 && ds.length > 1, last = k === ds.length - 1 && k > 0;
    if (first) {
      const p = ports[ports.length - 1];
      if (p) from = Math.max(from, mins(p.time) + (p.type === 'flight' ? AFTER_LANDING : stayOf(p) + 30));
      else if (items[0]) from = Math.max(from, mins(items[0].time));
    } else if (last) {
      const p = ports[0];
      if (p) to = Math.min(to, mins(p.time) - (p.type === 'flight' ? BEFORE_TAKEOFF : 90));
    } else for (const p of items.filter((x) => x.type === 'flight')) from = Math.max(from, mins(p.time) + AFTER_LANDING);
    const used = items.filter((p) => !isPort(p) && mins(p.time) >= from && mins(p.time) < to).reduce((s, p) => s + stayOf(p) + (p.type === 'stay' ? 0 : 25), 0);
    return Math.max(0, to - from - used);
  });
  const food = ds.map((d) => dayItems(t, d).filter((p) => p.type === 'food').length);
  const pick: Unit[][] = ds.map(() => []);
  const left: Unit[] = [];

  // 지역 나누기: 서로 10km 안으로 이어지는 곳끼리 한 지역 (오사카 / 교토 / 나라 …)
  const geoUnits = units.filter((u) => u.geo && !isWholeDay(u.head));
  const par = geoUnits.map((_, i) => i);
  const root = (i: number): number => (par[i] === i ? i : (par[i] = root(par[i])));
  for (let i = 0; i < geoUnits.length; i++)
    for (let j = i + 1; j < geoUnits.length; j++) if (km(geoUnits[i].geo!, geoUnits[j].geo!) <= REGION_KM) par[root(i)] = root(j);
  const regions = new Map<number, Unit[]>();
  geoUnits.forEach((u, i) => regions.set(root(i), [...(regions.get(root(i)) ?? []), u]));

  // 하루치 묶음(블록). 큰 지역은 가까운 것끼리 이어서 며칠로 나눔
  interface Block { units: Unit[]; cost: number; center: Geo | null; whole?: boolean }
  const chainOf = (us: Unit[]) => {
    const rest = [...us], out: Unit[] = [];
    let at = rest.reduce((m, u) => (u.geo!.lng < m.lng ? u.geo! : m), rest[0].geo!);
    while (rest.length) {
      let bi = 0;
      for (let i = 1; i < rest.length; i++) if (km(at, rest[i].geo!) < km(at, rest[bi].geo!)) bi = i;
      const u = rest.splice(bi, 1)[0];
      out.push(u);
      at = u.geo!;
    }
    return out;
  };
  const sumCost = (us: Unit[]) => us.reduce((s, u) => s + cost(u), 0);
  const split = (us: Unit[], parts: number): Unit[][] => {
    const ch = chainOf(us), target = sumCost(us) / parts, out: Unit[][] = [[]];
    let acc = 0;
    for (const u of ch) {
      if (acc >= target - cost(u) / 2 && out.length < parts && out[out.length - 1].length) {
        out.push([]);
        acc = 0;
      }
      out[out.length - 1].push(u);
      acc += cost(u);
    }
    return out;
  };
  const mk = (us: Unit[], whole = false): Block => {
    const g = us.filter((u) => u.geo).map((u) => u.geo!);
    return { units: us, cost: sumCost(us), center: g.length ? { lat: g.reduce((s, x) => s + x.lat, 0) / g.length, lng: g.reduce((s, x) => s + x.lng, 0) / g.length } : null, whole };
  };
  const blocks: Block[] = [];
  for (const us of regions.values()) for (const p of split(us, Math.max(1, Math.ceil(sumCost(us) / FULL_DAY)))) blocks.push(mk(p));
  for (const u of units.filter((x) => isWholeDay(x.head))) blocks.push(mk([u], true));
  // 시간 있는 날이 남으면 큰 블록을 더 나눠서 고르게
  const usable = ds.filter((_, k) => free[k] >= 360).length; // 반나절 넘게 비는 날만 셈
  while (blocks.length < usable) {
    const big = blocks.filter((x) => !x.whole && x.units.length > 1 && x.cost >= 240).sort((p, q) => q.cost - p.cost)[0];
    if (!big) break;
    blocks.splice(blocks.indexOf(big), 1, ...split(big.units, 2).map((us) => mk(us)));
  }

  // 날마다 기준 위치: 그날 원래 있던 일정(숙소·예약 등), 없으면 비행기
  const anchor = ds.map((d) => {
    const items = dayItems(t, d).filter((p) => p.geo);
    const g = (items.some((p) => p.type !== 'flight') ? items.filter((p) => p.type !== 'flight') : items).map((p) => p.geo!);
    return g.length ? { lat: g.reduce((s, x) => s + x.lat, 0) / g.length, lng: g.reduce((s, x) => s + x.lng, 0) / g.length } : null;
  });
  // 블록 → 날짜. 시간이 모자란 날은 그날 원래 일정 근처 지역으로, 하루 통째인 날은 멀리 가는 지역
  const fit = (b: Block, k: number) =>
    Math.max(0, b.cost - free[k]) * 2 + (b.center && anchor[k] ? km(b.center, anchor[k]!) * (free[k] < 360 ? 25 : 4) : 0) + (b.whole && free[k] < 480 ? 5000 : 0);
  const dayOf: number[] = blocks.map(() => -1);
  // 시간이 거의 없는 날(도착일 저녁 등)은 블록을 받지 않음. 넘치는 것만 나중에 들어갈 수 있음
  const cand = ds.map((_, k) => k).filter((k) => free[k] >= 120);
  if (!cand.length) cand.push(...ds.map((_, k) => k));
  if (blocks.length <= cand.length && cand.length <= 8) {
    let best = Infinity;
    const cur: number[] = [];
    const rec = (i: number, used: number, sum: number) => {
      if (sum >= best) return;
      if (i === blocks.length) {
        best = sum;
        cur.forEach((k, j) => (dayOf[j] = k));
        return;
      }
      for (const k of cand)
        if (!(used & (1 << k))) {
          cur[i] = k;
          rec(i + 1, used | (1 << k), sum + fit(blocks[i], k));
        }
    };
    rec(0, 0, 0);
  } else {
    const left = [...free];
    const used = ds.map(() => 0);
    blocks
      .map((b, i) => [b, i] as const)
      .sort((p, q) => q[0].cost - p[0].cost)
      .forEach(([b, i]) => {
        let bk = 0, bs = Infinity;
        cand.forEach((k) => {
          const sc = Math.max(0, b.cost - left[k]) * 2 + (b.center && anchor[k] ? km(b.center, anchor[k]!) * 4 : 0) + used[k] * 200 + (b.whole && (used[k] || left[k] < 480) ? 5000 : 0);
          if (sc < bs) {
            bs = sc;
            bk = k;
          }
        });
        dayOf[i] = bk;
        left[bk] -= b.cost;
        used[bk]++;
      });
  }

  // 그날 시간·밥집 수에 맞게 담고, 넘치는 건 시간 남는 가까운 날로
  const center = ds.map((_, k) => blocks.find((b, i) => dayOf[i] === k)?.center ?? anchor[k]);
  const over: Unit[] = [];
  blocks.forEach((b, i) => {
    const k = dayOf[i];
    for (const u of b.whole ? b.units : chainOf(b.units)) {
      if (cost(u) > free[k] + 30 || (isFood(u) && food[k] >= 3) || (pick[k].some((v) => isWholeDay(v.head)) && !b.whole)) over.push(u);
      else {
        pick[k].push(u);
        free[k] -= cost(u);
        if (isFood(u)) food[k]++;
      }
    }
  });
  over.push(...units.filter((u) => !u.geo));
  for (const u of over) {
    let j = -1, js = Infinity;
    ds.forEach((_, x) => {
      if (free[x] < cost(u) || (isFood(u) && food[x] >= 3) || pick[x].some((v) => isWholeDay(v.head))) return;
      const sc = u.geo && center[x] ? km(u.geo, center[x]!) : 50 - free[x] / 60;
      if (sc < js) {
        js = sc;
        j = x;
      }
    });
    if (j < 0) left.push(u);
    else {
      pick[j].push(u);
      free[j] -= cost(u);
      if (isFood(u)) food[j]++;
    }
  }

  // 그날 안에서 자리 잡기: 오래 머무는 것 먼저, 밥집은 나중에. 고정 일정에 늦게 되면 안 넣음
  ds.forEach((date, k) => {
    if (!pick[k].length) return;
    const edge = { first: k === 0, last: k === ds.length - 1 };
    const seq: Slot[] = dayItems(t, date).map((p) => ({ it: p, isNew: false, fixed: isFixed(t, p) }));
    const base = simulate(seq, edge).bad;
    const order = [...pick[k]].sort((a, b) => (isFood(a) ? 1 : 0) - (isFood(b) ? 1 : 0) || cost(b) - cost(a));
    for (const u of order) {
      const it = toItem(u, date);
      let best = -1, bestBad = Infinity;
      for (let i = 0; i <= seq.length; i++) {
        const { bad } = simulate([...seq.slice(0, i), { it, isNew: true, fixed: false, u }, ...seq.slice(i)], edge);
        if (bad < bestBad) {
          bestBad = bad;
          best = i;
        }
      }
      if (bestBad - base >= 1000) {
        left.push(u);
        continue;
      }
      seq.splice(best, 0, { it, isNew: true, fixed: false, u });
    }
    // 새로 넣은 것끼리 자리 맞바꿔 보며 더 나아질 때까지
    let cur = simulate(seq, edge).bad;
    for (let round = 0, better = true; better && round < 20; round++) {
      better = false;
      for (let i = 0; i < seq.length; i++)
        for (let j = i + 1; j < seq.length; j++) {
          if (!seq[i].isNew || !seq[j].isNew) continue;
          [seq[i], seq[j]] = [seq[j], seq[i]];
          const b = simulate(seq, edge).bad;
          if (b < cur - 1e-6) {
            cur = b;
            better = true;
          } else [seq[i], seq[j]] = [seq[j], seq[i]];
        }
    }
    const { at } = simulate(seq);
    seq.forEach((s, i) => {
      if (s.fixed) return;
      const tm = hhmm(Math.min(23 * 60 + 55, Math.ceil(at[i] / 5) * 5));
      if (s.isNew || tm !== s.it.time) {
        s.it.time = tm;
        delete s.it.wx;
      }
    });
    seq.forEach((s, i) => {
      if (s.u) {
        t.plan.push(s.it);
        if (s.u.headLinked) {
          s.u.head.planId = s.it.id;
          n++;
        }
        for (const w of s.u.members ?? []) {
          w.planId = s.it.id;
          n++;
        }
      }
      if (s.u || seq[i - 1]?.u) s.it.travel = null;
    });
    writeOrder(t, seq.map((s) => s.it.id));
  });
  // 남은 수: 못 넣은 묶음 안의 장소들
  const leftN = left.reduce((s, u) => s + (u.headLinked ? 1 : 0) + (u.members?.length ?? 0), 0);
  return { n, left: leftN, skipped };
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
