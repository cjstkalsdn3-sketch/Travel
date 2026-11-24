import type { Booking, Cat, Geo, Hours, PlanItem, Stop, Trip, Wish } from './types';
import { daysOf, mins, pd, uid } from './utils';
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
/** 점에서 선분(a–b)까지 거리(km) */
export function segKm(p: Geo, a: Geo, b: Geo): number {
  const kx = 111.32 * Math.cos((a.lat * Math.PI) / 180), ky = 110.57;
  const [px, py, bx, by] = [(p.lng - a.lng) * kx, (p.lat - a.lat) * ky, (b.lng - a.lng) * kx, (b.lat - a.lat) * ky];
  const l = bx * bx + by * by, u = l ? Math.max(0, Math.min(1, (px * bx + py * by) / l)) : 0;
  return Math.hypot(px - u * bx, py - u * by);
}
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
  return { id: uid(), date, time: '10:00', type: w.type, title: w.title, note: w.note, place: w.place, travel: null, geo: w.geo ?? null, ...(w.hours ? { hours: w.hours } : {}) };
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
/** 담아둔 곳 점수: 둘 다 ★ 2, 한 명 ★(또는 예전 '꼭 갈 곳') 1, 보통 0, 시간 되면 -1 */
export const wishScore = (w: Pick<Wish, 'prio' | 'stars'>): number => (w.stars?.length ? Math.min(2, w.stars.length) : w.prio === 1 ? 1 : w.prio === -1 ? -1 : 0);
/** 역·정류장 기준으로 묶을 거리: 걸어서 30분쯤 */
const NEAR_KM = 2.2;
/** 역 없이 장소끼리 묶을 거리: 걸어서 20분쯤 */
const WALK_KM = 1.5;
/** 묶음 하나가 넘지 않을 시간 (넘으면 같은 역으로 두 번 나눔) */
const GROUP_MAX = 360;
/** 한 지역으로 볼 거리 (서로 이만큼 안으로 이어지면 같은 지역) */
const REGION_KM = 15;
/** 하루에 돌 수 있는 시간 */
const FULL_DAY = 540;
/** 하루를 통째로 쓰는 곳 (테마파크) */
const WHOLE_DAY = /유니버(설|셜)|universal|USJ|디즈니|disney|레고랜드|legoland|후지큐|fuji-?q|에버랜드|롯데월드|시월드|seaworld|six flags|식스 ?플래그/i;
const isWholeDay = (w: Pick<Wish, 'title' | 'place'>) => WHOLE_DAY.test(`${w.title} ${w.place}`);
/** 밤에 가도 되는 곳: 상점가·시장·야경·전망대·온천 등 (밥집·쇼핑은 원래 늦게까지) */
const NIGHT = /상점가|시장|거리|야경|전망대|스카이|타워|온천|스파|사우나|銭湯|도톤보리|돈키호테|이자카야|요코초|아케이드|쇼핑|몰|마켓|백화점|night|market|tower|onsen|spa|sky/i;
const ONSEN = /온천|스파|사우나|銭湯|onsen|spa/i;
/** 아침에 빌려서 하루 입고 다니는 것 (기모노 대여 등) */
const MORNING = /렌탈|렌트|rental|대여|기모노|kimono|着物/i;
const nightOk = (p: PlanItem) => !MORNING.test(`${p.title} ${p.place}`) && (p.type === 'food' || p.type === 'shop' || NIGHT.test(`${p.title} ${p.place}`) || !!p.stops?.some((x) => NIGHT.test(x.name)));
/** 밤에 가도 되는 곳은 이때까지 */
const NIGHT_TO = 22 * 60 + 30;
/** 공항 일정: 항공으로 적었거나, 이름·장소에 공항이 들어간 일정 ("고베 공항 (UKB)") */
const isPort = (p: PlanItem) => p.type === 'flight' || /공항|airport|空港|\([A-Z]{3}\)/i.test(`${p.title} ${p.place}`);
/** 공항 가는 리무진 등: 마지막 날 이걸 탄 뒤로는 아무것도 안 넣음 */
const toAirport = (p: PlanItem) => isPort(p) || /리무진|limousine|공항.?버스|airport ?bus|스카이라이너|skyliner|하루카|haruka|라피트|rapi:?t|나리타 ?익스프레스|n'?ex/i.test(`${p.title} ${p.place}`);
const DAY_FROM = 9 * 60 + 30, DAY_TO = 21 * 60;
/** 비행기 앞뒤로 비워둘 시간: 내려서 입국·이동, 타기 전 공항 도착 */
const AFTER_LANDING = 240, BEFORE_TAKEOFF = 180; // 일정의 비행기 시각은 출발 시각이라 비행시간까지 넉넉히
/** 공항 일정(항공 말고 '기타' 등으로 적은 것) 앞뒤 여유 */
const PORT_BEFORE = 90, PORT_AFTER = 30;
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
/** 그 요일에 여는 시간대들 [여는, 닫는] (분). 전날 밤부터 이어지는 영업도 포함 */
export function openOn(h: Hours, wd: number): [number, number][] {
  const out: [number, number][] = h.filter(([d]) => d === wd).map(([, o, c]) => [o, c]);
  for (const [d, o, c] of h) if (d === (wd + 6) % 7 && c > 1440) out.push([Math.max(0, o - 1440), c - 1440]);
  return out.sort((a, b) => a[0] - b[0]);
}

function simulate(seq: Slot[], edge: { first?: boolean; last?: boolean } = {}): { at: number[]; bad: number } {
  const at: number[] = [];
  let bad = 0, end = -1;
  let prev: Slot | null = null;
  for (const s of seq) {
    const p = s.it;
    let start: number;
    if (!prev) start = s.isNew ? DAY_FROM : mins(p.time);
    else {
      // 공항 앞뒤 여유: 비행기는 타기 전 공항 도착·내린 뒤 입국, '기타'로 적은 공항 일정도 앞뒤로 조금씩 (경유할 때도)
      const move = estMin(exitGeo(prev.it), p.geo);
      const gap = p.type === 'flight' ? move + BEFORE_TAKEOFF - 60 : isPort(p) ? move + PORT_BEFORE : move;
      const ready = end + (prev.it.type === 'flight' ? AFTER_LANDING : isPort(prev.it) ? gap + PORT_AFTER : gap);
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
    if (s.isNew && edge.last && !edge.first && seq.slice(0, seq.indexOf(s)).some((x) => toAirport(x.it))) bad += 5000;
    // 경유하는 날(공항 일정이 둘 이상): 내린 공항과 다시 타는 공항 사이에만
    if (s.isNew && !edge.first && !edge.last && seq.filter((x) => isPort(x.it)).length >= 2) {
      const i = seq.indexOf(s);
      if (!seq.slice(0, i).some((x) => isPort(x.it)) || !seq.slice(i + 1).some((x) => isPort(x.it))) bad += 5000;
    }
    // 구글 영업시간을 알면 그걸로: 쉬는 날엔 안 넣고, 열기 전이면 열 때까지 기다리고, 닫기 전에 다 못 보면 안 넣음
    const hrs = s.isNew && p.hours?.length ? openOn(p.hours, pd(p.date).getDay()) : null;
    if (hrs) {
      const st = stayOf(p);
      const slot = hrs.find(([o, c]) => c > start && Math.max(start, o) + Math.min(st, c - o) <= c);
      if (!hrs.length) bad += 5000;
      else if (!slot) bad += 1000;
      else if (slot[0] > start) {
        bad += (slot[0] - start) * 0.5; // 문 열 때까지 기다림
        start = slot[0];
      }
    }
    if (s.isNew) {
      const fin = start + stayOf(p);
      const endOK = hrs?.length ? NIGHT_TO : nightOk(p) ? NIGHT_TO : DAY_TO;
      if (fin > endOK) bad += (fin - endOK) * 4 + (fin > endOK + 30 ? 1000 : 0); // 너무 늦게까지
      if (ONSEN.test(`${p.title} ${p.place}`) && start < 17 * 60) bad += (17 * 60 - start) * 1.2; // 온천은 저녁에
      if (MORNING.test(`${p.title} ${p.place}`) && start > 12 * 60) bad += (start - 12 * 60) * 3; // 대여는 오전에
      if (p.type === 'food') {
        const off = Math.min(...MEALS.map(([a, b]) => (start < a ? a - start : start > b ? start - b : 0)));
        bad += off * 1.5; // 밥 먹을 때가 아님
        if (prev?.it.type === 'food') bad += 90; // 밥 먹고 바로 또 밥
      }
      if (!hrs && !nightOk(p) && start > 16 * 60 + 30) bad += (start - (16 * 60 + 30)) * 3; // 영업시간을 모르면: 구경거리는 저녁이면 닫는 곳이 많음
      if (!hrs && !nightOk(p) && start > 19 * 60 + 30) bad += 1000; // 밤늦게 구경은 넣지 않음
    } else if (!s.fixed && start > mins(p.time)) bad += (start - mins(p.time)) * 2 + (start - mins(p.time) > 30 ? 1000 : 0); // 원래 일정이 밀림 (30분 넘게 밀리면 안 넣음)
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
/** 자동 배치에서 찾은 지역 (key = 그 지역 대표 장소의 담아둔 곳 id) */
export interface AutoRegion { key: string; label: string; count: number; center: Geo | null }
export interface AutoResult {
  n: number; left: number; skipped: number; regions: AutoRegion[]; dayRegion: Record<string, string>;
  /** 못 넣은 곳 (담아둔 곳 id → 그 지역 key, 지역 없으면 '') */
  leftWish: Record<string, string>;
}

/** opts.lock: 날짜 → 중심 위치. 그 날은 그 근처 지역으로 짠다. 없으면 여행에 정해둔 날짜별 메인 지역(t.area) */
export function autoPlace(t: Trip, ids?: string[], opts: { lock?: Record<string, Geo> } = {}): AutoResult {
  const lock: Record<string, Geo> = {};
  for (const [d, a] of Object.entries(t.area ?? {})) if (a.geo) lock[d] = a.geo;
  Object.assign(lock, opts.lock ?? {});
  const all = unplaced(t).filter((w) => !ids || ids.includes(w.id));
  const ds = daysOf(t);
  if (!all.length || !ds.length) return { n: 0, left: all.length, skipped: 0, regions: [], dayRegion: {}, leftWish: {} };
  let n = 0, skipped = 0;

  // 공항·숙소: 일정에 있는 비행기·숙소에 이어 붙임
  const nearest = (w: Wish, list: PlanItem[]) => [...list].sort((a, b) => (w.geo && a.geo ? km(w.geo, a.geo) : 99) - (w.geo && b.geo ? km(w.geo, b.geo) : 99))[0];
  // 공항으로 담아둔 곳(이름에 공항·airport·(KIX) 등)도 비행기·공항 일정에 이어 붙임. 하루 일정 중간에 따로 넣지 않음
  const portWish = (w: Wish) => w.type === 'flight' || /공항|airport|空港|\([A-Z]{3}\)/i.test(`${w.title} ${w.place ?? ''}`);
  for (const w of all.filter(portWish)) {
    const f = nearest(w, t.plan.filter(isPort));
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
  const rest = all.filter((w) => !w.planId && !portWish(w) && w.type !== 'stay' && w.type !== 'move');
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
  // 역이 없는 곳: 걸어서 20분(1.5km) 안에 다른 곳이 있으면 가운데 있는 곳 아래로 묶음 (교집합)
  const loose = rest.filter((w) => !grouped.has(w.id) && w.geo && !['station', 'bus', 'food'].includes(w.type) && !isWholeDay(w));
  for (;;) {
    const near = (w: Wish) => loose.filter((x) => x !== w && km(x.geo!, w.geo!) <= WALK_KM);
    const head = [...loose].sort((a, b) => near(b).length - near(a).length || wishScore(b) - wishScore(a))[0];
    if (!head || near(head).length < 1) break;
    const ms = near(head).sort((a, b) => wishScore(b) - wishScore(a) || km(a.geo!, head.geo!) - km(b.geo!, head.geo!)).slice(0, Math.floor((GROUP_MAX - DEFAULT_STAY[head.type]) / 50));
    const ordered = orderStops(head.geo, ms.map((w) => ({ id: w.id, name: w.title, geo: w.geo, type: w.type, wishId: w.id }))).map((st) => ms.find((w) => w.id === st.wishId)!);
    units.push({ head, members: ordered, headLinked: true, geo: head.geo });
    for (const w of [head, ...ms]) {
      grouped.add(w.id);
      loose.splice(loose.indexOf(w), 1);
    }
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
  /** 묶음 우선순위: 안에 꼭 갈 곳이 있으면 꼭, 다 '시간 되면'이면 시간 되면 */
  const prio = (u: Unit) => { const ws = [...(u.headLinked ? [u.head] : []), ...(u.members ?? [])]; return ws.length ? Math.max(...ws.map(wishScore)) : 0; };
  /** 꼭 갈 곳은 하루가 조금(2시간까지) 넘쳐도 넣음 */
  const slack = (u: Unit) => (prio(u) >= 2 ? 180 : prio(u) === 1 ? 120 : 0);

  // 날마다 쓸 수 있는 시간
  const free = ds.map((d, k) => {
    const items = dayItems(t, d);
    let from = DAY_FROM, to = DAY_TO + 60; // 밤에 상점가·온천 등도 가니 조금 늦게까지
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
    // 중간에 경유하는 날: 공항 일정 앞뒤 여유만큼 빼고
    const portGap = first || last ? 0 : items.filter(isPort).reduce((s, p) => s + (p.type === 'flight' ? 0 : PORT_BEFORE + PORT_AFTER + stayOf(p)), 0);
    const used = items.filter((p) => !isPort(p) && mins(p.time) >= from && mins(p.time) < to).reduce((s, p) => s + stayOf(p) + (p.type === 'stay' ? 0 : 25), 0);
    return Math.max(0, to - from - used - portGap);
  });
  const food = ds.map((d) => dayItems(t, d).filter((p) => p.type === 'food').length);
  const pick: Unit[][] = ds.map(() => []);
  const left: Unit[] = [];
  // 첫날·마지막 날은 공항 ↔ 숙소 가는 길: 그 길에서 얼마나 벗어나는지로 잼 (린쿠 아울렛처럼 오가는 길에 있는 곳 활용)
  const way = ds.map((d, k): [Geo, Geo] | null => {
    if (ds.length < 2 || (k !== 0 && k !== ds.length - 1)) return null;
    const ports = dayItems(t, d).filter((p) => isPort(p) && p.geo);
    const port = k === 0 ? ports[ports.length - 1] : ports[0];
    const land = (x: string) => dayItems(t, x).filter((p) => p.geo && !isPort(p));
    // 첫날: 그날 숙소(공항 아닌 마지막 곳) / 마지막 날: 그날 첫 곳, 없으면 전날 밤 있던 곳
    const back = () => { for (let j = k - 1; j >= 0; j--) { const g = land(ds[j]).pop()?.geo; if (g) return g; } };
    const fwd = () => { for (let j = 1; j < ds.length; j++) { const g = land(ds[j]).shift()?.geo; if (g) return g; } };
    const stay = k === 0 ? (land(d).pop()?.geo ?? fwd()) : (land(d).shift()?.geo ?? back());
    return port?.geo && stay && km(port.geo, stay) > 3 ? [port.geo, stay] : null;
  });
  /** 그날 기준점(또는 공항 가는 길)에서 얼마나 먼지 */
  const offDay = (k: number, g: Geo, base: Geo | null | undefined) => (way[k] ? segKm(g, way[k]![0], way[k]![1]) : base ? km(g, base) : 0);
  // 공항 오가는 길에 있는 곳(길에서 8km 안, 숙소 동네는 아닌 곳)은 그날 먼저 넣음
  const onWay = new Set<Unit>();
  for (const k of [0, ds.length - 1]) {
    const w = way[k];
    if (!w) continue;
    const near = units
      .filter((u) => u.geo && !isWholeDay(u.head) && !onWay.has(u) && segKm(u.geo, w[0], w[1]) <= 8 && km(u.geo, w[1]) > 10)
      .sort((p, q) => prio(q) - prio(p) || segKm(p.geo!, w[0], w[1]) - segKm(q.geo!, w[0], w[1]));
    for (const u of near)
      if (cost(u) <= free[k] + 30 + slack(u) && !(isFood(u) && food[k] >= 1)) {
        pick[k].push(u);
        free[k] -= cost(u);
        if (isFood(u)) food[k]++;
        onWay.add(u);
      }
  }

  // 지역 나누기: 서로 10km 안으로 이어지는 곳끼리 한 지역 (오사카 / 교토 / 나라 …)
  const geoUnits = units.filter((u) => u.geo && !isWholeDay(u.head) && !onWay.has(u));
  const par = geoUnits.map((_, i) => i);
  const root = (i: number): number => (par[i] === i ? i : (par[i] = root(par[i])));
  for (let i = 0; i < geoUnits.length; i++)
    for (let j = i + 1; j < geoUnits.length; j++) if (km(geoUnits[i].geo!, geoUnits[j].geo!) <= REGION_KM) par[root(i)] = root(j);
  const regions = new Map<number, Unit[]>();
  geoUnits.forEach((u, i) => regions.set(root(i), [...(regions.get(root(i)) ?? []), u]));
  // 지역 이름: 오래 머무는 곳 두 개로 ("기요미즈데라·후시미 이나리")
  const regionInfo = new Map<number, AutoRegion>();
  const unitsCount = (us: Unit[]) => us.reduce((s, u) => s + (u.headLinked ? 1 : 0) + (u.members?.length ?? 0), 0);
  for (const [r, us] of regions) {
    const top = [...us].sort((a, b) => stayOf(toItem(b, ds[0])) - stayOf(toItem(a, ds[0])));
    const g = us.map((u) => u.geo!);
    regionInfo.set(r, { key: top[0].head.id, label: top.slice(0, 2).map((u) => u.head.title).join(' · '), count: unitsCount(us), center: { lat: g.reduce((s, x) => s + x.lat, 0) / g.length, lng: g.reduce((s, x) => s + x.lng, 0) / g.length } });
  }
  units.filter((x) => isWholeDay(x.head)).forEach((u, i) => regionInfo.set(-1 - i, { key: u.head.id, label: u.head.title, count: 1, center: u.geo ?? null }));
  const keyOf = (r: number) => regionInfo.get(r)?.key;
  /** 블록이 메인 지역으로 정해둔 날 근처인가 */
  const lockNear = (b: Block, d: string) => !!(lock[d] && b.center && km(b.center, lock[d]) <= REGION_KM * 1.5);

  // 하루치 묶음(블록). 큰 지역은 가까운 것끼리 이어서 며칠로 나눔
  interface Block { units: Unit[]; cost: number; center: Geo | null; whole?: boolean; region: number }
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
  const mk = (us: Unit[], region: number, whole = false): Block => {
    const g = us.filter((u) => u.geo).map((u) => u.geo!);
    return { units: us, region, cost: sumCost(us), center: g.length ? { lat: g.reduce((s, x) => s + x.lat, 0) / g.length, lng: g.reduce((s, x) => s + x.lng, 0) / g.length } : null, whole };
  };
  const blocks: Block[] = [];
  for (const [r, us] of regions) for (const p of split(us, Math.max(1, Math.ceil(sumCost(us) / FULL_DAY)))) blocks.push(mk(p, r));
  units.filter((x) => isWholeDay(x.head)).forEach((u, i) => blocks.push(mk([u], -1 - i, true)));
  // 시간 있는 날이 남으면 큰 블록을 더 나눠서 고르게
  const usable = ds.filter((_, k) => free[k] >= 360).length; // 반나절 넘게 비는 날만 셈
  while (blocks.length < usable) {
    const big = blocks.filter((x) => !x.whole && x.units.length > 1 && x.cost >= 240).sort((p, q) => q.cost - p.cost)[0];
    if (!big) break;
    blocks.splice(blocks.indexOf(big), 1, ...split(big.units, 2).map((us) => mk(us, big.region)));
  }

  // 날마다 기준 위치: 그날 원래 있던 일정(숙소·예약 등), 없으면 비행기
  const anchor = ds.map((d) => {
    const items = dayItems(t, d).filter((p) => p.geo);
    const g = (items.some((p) => !isPort(p)) ? items.filter((p) => !isPort(p)) : items).map((p) => p.geo!);
    return g.length ? { lat: g.reduce((s, x) => s + x.lat, 0) / g.length, lng: g.reduce((s, x) => s + x.lng, 0) / g.length } : null;
  });
  // 이미 일정이 둘 이상 있는 날(예: 하코네 당일치기)은 그 동네에서 먼 곳을 끼워 넣지 않음
  const planned = ds.map((d) => dayItems(t, d).filter((p) => p.geo && !isPort(p) && p.type !== 'stay').length >= 2);
  const farFrom = (k: number, g?: Geo | null) => !!(planned[k] && !lock[ds[k]] && g && anchor[k] && km(g, anchor[k]!) > REGION_KM * 1.5);
  // 일정이 하나도 없는 날은 전날 마지막으로 있던 곳(잔 곳)에서 시작, 없으면 다음 날 첫 일정 근처
  const lastGeo = (d: string) => [...dayItems(t, d)].reverse().find((p) => p.geo)?.geo;
  const firstGeo = (d: string) => dayItems(t, d).find((p) => p.geo)?.geo;
  for (let k = 0; k < ds.length; k++) if (!anchor[k]) anchor[k] = (k > 0 && lastGeo(ds[k - 1])) || (k < ds.length - 1 && firstGeo(ds[k + 1])) || null;
  // 블록 → 날짜. 시간이 모자란 날은 그날 원래 일정 근처 지역으로, 하루 통째인 날은 멀리 가는 지역
  const fit = (b: Block, k: number) =>
    (lock[ds[k]] ? (lockNear(b, ds[k]) ? -1000 : b.center ? km(b.center, lock[ds[k]]) * 300 : 100000) : ds.some((d) => lockNear(b, d)) ? 50000 : 0) +
    (farFrom(k, b.center) ? 50000 : 0) +
    Math.max(0, b.cost - free[k]) * 2 + (b.center && anchor[k] ? offDay(k, b.center, anchor[k]) * (free[k] < 360 ? 25 : 4) : 0) + (b.whole && free[k] < 480 ? 5000 : 0);
  const dayOf: number[] = blocks.map(() => -1);
  // 시간이 거의 없는 날(도착일 저녁 등)은 블록을 받지 않음. 넘치는 것만 나중에 들어갈 수 있음
  const cand = ds.map((_, k) => k).filter((k) => free[k] >= 120 || lock[ds[k]]);
  if (!cand.length) cand.push(...ds.map((_, k) => k));
  // 날짜 수보다 블록이 많으면 꼭 갈 곳이 많은 블록부터 하루씩 받고, 나머지는 같은 지역 날에 얹음 (넘치면 남김)
  const bprio = (b: Block) => b.units.reduce((s, u) => s + prio(u) * 100, 0) + b.cost / 100;
  const byPrio = blocks.map((_, i) => i).sort((p, q) => bprio(blocks[q]) - bprio(blocks[p]));
  // 지역마다 먼저 하루씩: 한 지역(오사카)에 담아둔 곳이 많아도 다른 지역(교토·나라)이 통째로 빠지지 않게
  const firstOfRegion = byPrio.filter((i, j) => byPrio.findIndex((x) => blocks[x].region === blocks[i].region) === j);
  const rank = [...firstOfRegion, ...byPrio.filter((i) => !firstOfRegion.includes(i))];
  // '시간 되면' 곳만 있는 블록은 하루를 따로 받지 않음
  const lowOnly = (i: number) => blocks[i].units.every((u) => prio(u) === -1);
  const own = rank.filter((i) => !lowOnly(i)).slice(0, cand.length);
  const extra = rank.filter((i) => !own.includes(i));
  if (cand.length <= 8) {
    let best = Infinity;
    const cur: number[] = [];
    const rec = (i: number, used: number, sum: number) => {
      if (sum >= best) return;
      if (i === own.length) {
        best = sum;
        cur.forEach((k, j) => (dayOf[own[j]] = k));
        return;
      }
      for (const k of cand)
        if (!(used & (1 << k))) {
          cur[i] = k;
          rec(i + 1, used | (1 << k), sum + fit(blocks[own[i]], k));
        }
    };
    rec(0, 0, 0);
  } else {
    const taken = new Set<number>();
    for (const i of own) {
      let bk = cand[0], bs = Infinity;
      for (const k of cand) if (!taken.has(k) && fit(blocks[i], k) < bs) [bs, bk] = [fit(blocks[i], k), k];
      dayOf[i] = bk;
      taken.add(bk);
    }
  }
  for (const i of extra) {
    const b = blocks[i];
    let bk = -1, bs = Infinity;
    for (const k of cand) {
      const mine = blocks.filter((x, j) => dayOf[j] === k);
      if (mine.some((x) => x.whole)) continue;
      if (lowOnly(i) && !mine.some((x) => x.region === b.region)) continue; // '시간 되면'만 있는 곳은 같은 지역 날에만
      const base = mine[0]?.center ?? anchor[k];
      const sc = (mine.some((x) => x.region === b.region) ? 0 : 1000) + (b.center && (base || way[k]) ? offDay(k, b.center, base) : 50) - free[k] / 100;
      if (sc < bs) [bs, bk] = [sc, k];
    }
    dayOf[i] = bk;
  }

  // 그날 시간·밥집 수에 맞게 담고, 넘치는 건 시간 남는 가까운 날로. 꼭 갈 곳 먼저, 시간 되면 갈 곳은 마지막에
  const center = ds.map((d, k) => lock[d] ?? blocks.find((b, i) => dayOf[i] === k && own.includes(i))?.center ?? anchor[k]);
  const over: Unit[] = [];
  const sights = ds.map(() => 0);
  const foodCap = (k: number) => Math.min(3, 1 + Math.floor(sights[k] / 2));
  ds.forEach((_, k) => {
    const mine = blocks.filter((b, i) => dayOf[i] === k);
    const us = mine.flatMap((b) => (b.whole ? b.units : chainOf(b.units)));
    // 꼭 갈 곳 먼저, 같은 순위면 구경거리 먼저 (밥집만 줄줄이 들어가지 않게: 밥집은 구경 2곳당 1곳 + 1)
    for (const u of [...us].sort((p, q) => prio(q) - prio(p) || (isFood(p) ? 1 : 0) - (isFood(q) ? 1 : 0))) {
      if (cost(u) > free[k] + 30 + slack(u) || (isFood(u) && food[k] >= foodCap(k)) || (pick[k].some((v) => isWholeDay(v.head)) && !isWholeDay(u.head))) over.push(u);
      else {
        pick[k].push(u);
        free[k] -= cost(u);
        if (isFood(u)) food[k]++;
        else sights[k]++;
      }
    }
  });
  blocks.forEach((b, i) => dayOf[i] < 0 && over.push(...b.units));
  over.push(...units.filter((u) => !u.geo));
  over.sort((p, q) => prio(q) - prio(p) || (isFood(p) ? 1 : 0) - (isFood(q) ? 1 : 0));
  for (const u of over) {
    let j = -1, js = Infinity;
    ds.forEach((_, x) => {
      if (free[x] + slack(u) < cost(u) || (isFood(u) && food[x] >= foodCap(x)) || pick[x].some((v) => isWholeDay(v.head))) return;
      // 위치 모르는 곳은 일정이 이미 짜인 날보다 빈 날로
      const sc = u.geo && center[x] ? offDay(x, u.geo, center[x]) : 50 - free[x] / 60 + (planned[x] ? 100 : 0);
      // '시간 되면' 곳은 다른 지역 날에 끼워 넣지 않음
      if (u.geo && center[x] && sc > REGION_KM * 1.5 && prio(u) === -1) return;
      if (farFrom(x, u.geo) && prio(u) < 1) return;
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
      else sights[j]++;
    }
  }

  // 그날 안에서 자리 잡기: 오래 머무는 것 먼저, 밥집은 나중에. 고정 일정에 늦게 되면 안 넣음
  const edgeOf = (k: number) => ({ first: k === 0, last: k === ds.length - 1 });
  const seqs: Slot[][] = ds.map((date) => dayItems(t, date).map((p) => ({ it: p, isNew: false, fixed: isFixed(t, p) || isPort(p) })));
  const bases = seqs.map((seq, k) => simulate(seq, edgeOf(k)).bad);
  const tryPlace = (k: number, u: Unit): boolean => {
    const seq = seqs[k], edge = edgeOf(k);
    const it = toItem(u, ds[k]);
    let best = -1, bestBad = Infinity;
    for (let i = 0; i <= seq.length; i++) {
      const { bad } = simulate([...seq.slice(0, i), { it, isNew: true, fixed: false, u }, ...seq.slice(i)], edge);
      if (bad < bestBad) {
        bestBad = bad;
        best = i;
      }
    }
    // 고정 일정에 늦게 되면 못 넣음. '시간 되면' 곳은 하루가 많이 꼬이면 빼둠
    if (bestBad - bases[k] >= 1000 || (prio(u) === -1 && bestBad - bases[k] > 240)) return false;
    seq.splice(best, 0, { it, isNew: true, fixed: false, u });
    bases[k] = bestBad;
    return true;
  };
  const retry: Unit[] = [];
  ds.forEach((_, k) => {
    const order = [...pick[k]].sort((a, b) => (onWay.has(b) ? 1 : 0) - (onWay.has(a) ? 1 : 0) || prio(b) - prio(a) || (isFood(a) ? 1 : 0) - (isFood(b) ? 1 : 0) || cost(b) - cost(a));
    for (const u of order) if (!tryPlace(k, u)) retry.push(u);
  });
  // 그날 못 넣은 건 가까운 다른 날에 한 번 더
  for (const u of retry.sort((p, q) => prio(q) - prio(p))) {
    const days = ds
      .map((_, x) => x)
      .filter((x) => !seqs[x].some((s) => s.u && isWholeDay(s.u.head)))
      .filter((x) => !(isFood(u) && seqs[x].filter((s) => s.u && isFood(s.u)).length >= 3))
      .filter((x) => !(prio(u) === -1 && u.geo && center[x] && km(u.geo, center[x]!) > REGION_KM * 1.5))
      .filter((x) => !(farFrom(x, u.geo) && prio(u) < 1))
      .sort((p, q) => (u.geo && center[p] ? offDay(p, u.geo, center[p]) : 0) - (u.geo && center[q] ? offDay(q, u.geo, center[q]) : 0));
    if (!days.some((x) => tryPlace(x, u))) left.push(u);
  }
  // 마지막으로: 어림한 남은 시간과 상관없이, 실제로 시간을 매겨 봐서 들어가면 넣음 (가까운 날부터)
  for (const u of [...left].sort((p, q) => prio(q) - prio(p))) {
    const days = ds
      .map((_, x) => x)
      .filter((x) => !seqs[x].some((s) => s.u && isWholeDay(s.u.head)))
      .filter((x) => !(isFood(u) && seqs[x].filter((s) => s.u && isFood(s.u)).length >= 3))
      .filter((x) => !(u.geo && center[x] && km(u.geo, center[x]!) > REGION_KM * 1.5 && prio(u) < 1))
      .sort((p, q) => (u.geo && center[p] ? offDay(p, u.geo, center[p]) : 0) - (u.geo && center[q] ? offDay(q, u.geo, center[q]) : 0));
    if (days.some((x) => tryPlace(x, u))) left.splice(left.indexOf(u), 1);
  }
  ds.forEach((date, k) => {
    const seq = seqs[k], edge = edgeOf(k);
    if (!seq.some((s) => s.isNew)) return;
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
        s.it.date = date;
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
  const dayRegion: Record<string, string> = {};
  ds.forEach((d, k) => {
    const b = blocks.find((x, i) => dayOf[i] === k && own.includes(i));
    const key = b && keyOf(b.region);
    if (key) dayRegion[d] = key;
  });
  const regionOfUnit = new Map<Unit, string>();
  for (const [r, us] of regions) for (const u of us) regionOfUnit.set(u, keyOf(r) ?? '');
  units.filter((x) => isWholeDay(x.head)).forEach((u, i) => regionOfUnit.set(u, keyOf(-1 - i) ?? ''));
  const leftWish: Record<string, string> = {};
  for (const u of left) for (const w of [...(u.headLinked ? [u.head] : []), ...(u.members ?? [])]) leftWish[w.id] = regionOfUnit.get(u) ?? '';
  return { n, left: leftN, skipped, regions: [...regionInfo.values()], dayRegion, leftWish };
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
