import type { AppData, Trip } from './types';

/** DB의 items 한 줄 */
export type Kind = 'trip' | 'plan' | 'exp' | 'book' | 'wish' | 'check' | 'memo';
export interface Row {
  id: string;
  kind: Kind;
  trip_id: string | null;
  data: Record<string, unknown>;
}

const CHILD: Exclude<Kind, 'trip'>[] = ['plan', 'exp', 'book', 'wish', 'check', 'memo'];

/** 키 순서와 상관없이 같은 값이면 같은 문자열 (jsonb는 키 순서를 바꾼다) */
export function stable(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  const o = v as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stable(o[k]))
      .join(',') +
    '}'
  );
}
export const rowKey = (r: Row) => stable({ kind: r.kind, trip_id: r.trip_id, data: r.data });

/** AppData → id별 행 */
export function flatten(d: AppData): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const t of d.trips) {
    const { plan, exp, book, wish, check, memo = [], ...rest } = t;
    m.set(t.id, { id: t.id, kind: 'trip', trip_id: null, data: rest });
    const kids = { plan, exp, book, wish, check, memo };
    for (const k of CHILD) for (const x of kids[k] as { id: string }[]) m.set(x.id, { id: x.id, kind: k, trip_id: t.id, data: x as unknown as Record<string, unknown> });
  }
  return m;
}

/** 행들 → 여행 목록. 자식은 만든 순서(id 순), 가볼 곳은 최신이 위로. */
export function build(rows: Iterable<Row>): Trip[] {
  const trips = new Map<string, Trip>();
  const kids: Row[] = [];
  for (const r of rows) {
    if (r.kind === 'trip') trips.set(r.id, { ...(r.data as unknown as Trip), id: r.id, plan: [], exp: [], book: [], wish: [], check: [], memo: [] });
    else kids.push(r);
  }
  kids.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of kids) {
    const t = r.trip_id ? trips.get(r.trip_id) : undefined;
    if (!t) continue;
    (t[r.kind as Exclude<Kind, 'trip'>] as unknown[]).push({ ...r.data, id: r.id });
  }
  for (const t of trips.values()) t.wish.reverse();
  return [...trips.values()];
}
