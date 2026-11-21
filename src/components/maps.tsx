'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { SheetHead, useUI } from './ui';
import { COUNTRY, MODES } from '@/lib/constants';
import { isMapsUrl, loadMaps, mapsEnabled, pickLeg, resolveLink, searchPlaces, travelMatrix, type LegTime, type PlaceHit } from '@/lib/maps';
import { dayItems, hhmm, isFixed, optimize, pathCost, stayOf, writeOrder, type Matrix } from '@/lib/plan';
import { updateTrip } from '@/lib/store';
import type { Cat, Geo, PlanItem, Trip, Wish } from '@/lib/types';
import { dur, host, mdw, mins, pd, uid } from '@/lib/utils';

export const tripCenter = (t: Trip): [number, number] => {
  const g = t.plan.find((p) => p.geo)?.geo ?? t.wish.find((w) => w.geo)?.geo;
  return g ? [g.lat, g.lng] : COUNTRY[t.country].center;
};

/* ================= 장소 입력: 검색 + 구글지도 링크 ================= */
export function PlaceField({
  trip,
  value,
  geo,
  onChange,
  label = '장소',
  id = 'place',
}: {
  trip: Trip;
  value: string;
  geo: Geo | null | undefined;
  onChange: (place: string, geo: Geo | null, hit?: PlaceHit) => void;
  label?: string;
  id?: string;
}) {
  const [q, setQ] = useState(value);
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bias = useMemo(() => tripCenter(trip), [trip]);

  function pick(h: PlaceHit) {
    setQ(h.name);
    setHits([]);
    onChange(h.name, { lat: h.lat, lng: h.lng, placeId: h.placeId, addr: h.addr }, h);
  }

  function onInput(v: string) {
    setQ(v);
    setErr('');
    onChange(v, null);
    clearTimeout(timer.current);
    if (!mapsEnabled) return;
    if (isMapsUrl(v)) {
      setBusy(true);
      resolveLink(v)
        .then((h) => (h ? pick(h) : setErr('링크에서 장소를 찾지 못했어요. 이름으로 검색해보세요.')))
        .catch(() => setErr('링크를 읽지 못했어요. 이름으로 검색해보세요.'))
        .finally(() => setBusy(false));
      return;
    }
    if (v.trim().length < 2) return setHits([]);
    timer.current = setTimeout(() => {
      setBusy(true);
      searchPlaces(v, bias)
        .then(setHits)
        .catch(() => setErr('검색이 안 돼요. 인터넷을 확인해주세요.'))
        .finally(() => setBusy(false));
    }, 400);
  }

  return (
    <div className="field place-field">
      <label htmlFor={id}>{label}{mapsEnabled ? ' (검색하거나 구글지도 링크 붙여넣기)' : ' (지도 검색어)'}</label>
      <div className="place-in">
        <input className="inp" id={id} value={q} onChange={(e) => onInput(e.target.value)} placeholder="예: 팀랩 플래닛" autoComplete="off" role="combobox" aria-expanded={hits.length > 0} aria-controls={id + '-list'} />
        {busy && <span className="spin" aria-label="찾는 중" />}
      </div>
      {geo && (
        <p className="geo-ok">
          <Icon name="sight" size={13} />
          위치 지정됨{geo.addr ? ` · ${geo.addr}` : ''}
          <button type="button" onClick={() => onChange(q, null)}>빼기</button>
        </p>
      )}
      {err && <p className="err">{err}</p>}
      {hits.length > 0 && (
        <ul className="hits" id={id + '-list'} role="listbox">
          {hits.map((h) => (
            <li key={h.placeId ?? h.name + h.lat}>
              <button type="button" role="option" aria-selected={false} onClick={() => pick(h)}>
                <b>{h.name}</b>
                <small>{h.addr}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================= 하루 지도 ================= */
export function DayMap({ items }: { items: PlanItem[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const drawn = useRef<(google.maps.Marker | google.maps.Polyline)[]>([]);
  const [err, setErr] = useState('');
  const pts = items.map((p, i) => ({ p, i })).filter((x) => x.p.geo);
  const sig = pts.map((x) => `${x.p.id}:${x.i}:${x.p.geo!.lat},${x.p.geo!.lng}`).join('|');

  useEffect(() => {
    let dead = false;
    loadMaps()
      .then((g) => {
        if (dead || !el.current) return;
        if (!map.current) map.current = new g.Map(el.current, { disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: 'cooperative' });
        drawn.current.forEach((d) => d.setMap(null));
        drawn.current = [];
        if (!pts.length) return;
        const bounds = new g.LatLngBounds();
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C93A6E';
        pts.forEach(({ p, i }) => {
          const pos = { lat: p.geo!.lat, lng: p.geo!.lng };
          bounds.extend(pos);
          drawn.current.push(
            new g.Marker({
              map: map.current!,
              position: pos,
              title: p.title,
              label: { text: String(i + 1), color: '#fff', fontWeight: '700', fontSize: '12px' },
              icon: { path: g.SymbolPath.CIRCLE, scale: 12, fillColor: accent, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
            }),
          );
        });
        drawn.current.push(
          new g.Polyline({
            map: map.current!,
            path: pts.map(({ p }) => ({ lat: p.geo!.lat, lng: p.geo!.lng })),
            strokeOpacity: 0,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, strokeColor: accent, scale: 3 }, offset: '0', repeat: '12px' }],
          }),
        );
        if (pts.length === 1) {
          map.current.setCenter(bounds.getCenter());
          map.current.setZoom(15);
        } else map.current.fitBounds(bounds, 40);
      })
      .catch((e: Error) => setErr(e.message));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  if (!pts.length) return <div className="map-empty">장소를 검색해서 고른 일정이 지도에 나와요.</div>;
  return (
    <div className="daymap-wrap">
      <div ref={el} className="daymap" role="img" aria-label="이날 일정 지도" />
      {err && <p className="err">{err}</p>}
      {pts.length < items.length && <p className="note">위치가 없는 일정 {items.length - pts.length}개는 지도에 안 보여요.</p>}
    </div>
  );
}

/* ================= 동선 정리 ================= */
/** 이 날짜와 같은 요일의 가까운 미래 11시(현지) — 대중교통 시간표 조회용 */
function departureFor(t: Trip, date: string): string {
  const now = new Date();
  const want = pd(date).getDay();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11 - COUNTRY[t.country].utc));
  while (d.getUTCDay() !== want || d <= now) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export function RouteSheet({ trip, date }: { trip: Trip; date: string }) {
  const { close, toast } = useUI();
  const items = useMemo(() => dayItems(trip, date), [trip, date]);
  const geoIdx = useMemo(() => items.map((p, i) => (p.geo ? i : -1)).filter((i) => i >= 0), [items]);
  const [legs, setLegs] = useState<LegTime[][] | null>(null);
  const [fetchErr, setErr] = useState('');
  const err = geoIdx.length > 10 ? '한 날에 위치가 있는 일정이 10곳을 넘으면 자동 정리를 못 해요.' : fetchErr;
  const [retime, setRetime] = useState(true);

  useEffect(() => {
    if (geoIdx.length < 2 || geoIdx.length > 10) return;
    travelMatrix(geoIdx.map((i) => items[i].geo!), departureFor(trip, date))
      .then(setLegs)
      .catch(() => setErr('이동 시간을 가져오지 못했어요. 잠시 뒤 다시 해주세요.'));
  }, [geoIdx, items, trip, date]);

  const plan = useMemo(() => {
    if (!legs) return null;
    const n = items.length;
    const pos = new Map(geoIdx.map((it, k) => [it, k]));
    const legAt = (a: number, b: number) => {
      const ka = pos.get(a);
      const kb = pos.get(b);
      return ka === undefined || kb === undefined ? null : pickLeg(legs[ka]?.[kb]);
    };
    const cost: Matrix = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => legAt(a, b)?.min ?? Infinity));
    const fixedPos = items.map((p) => !p.geo || isFixed(trip, p));
    const order = optimize(n, fixedPos, cost);
    const base = items.map((_, i) => i);
    return { order, before: pathCost(base, cost), after: pathCost(order, cost), legAt, fixedPos };
  }, [legs, items, geoIdx, trip]);

  function apply(order: number[]) {
    if (!plan) return;
    updateTrip(trip.id, (t) => {
      writeOrder(t, order.map((i) => items[i].id));
      let prev: PlanItem | null = null;
      let prevIdx = -1;
      for (const i of order) {
        const p = t.plan.find((x) => x.id === items[i].id)!;
        if (prev) {
          const leg = plan.legAt(prevIdx, i);
          if (leg) p.travel = { ...leg, auto: true };
          if (retime && leg && !isFixed(t, p)) {
            const at = mins(prev.time) + stayOf(prev) + leg.min;
            const rounded = Math.ceil(at / 5) * 5;
            if (rounded < 24 * 60) p.time = hhmm(rounded);
          }
        }
        prev = p;
        prevIdx = i;
      }
    });
    close();
    toast('동선을 정리했어요');
  }

  if (!mapsEnabled) return (<><SheetHead title="동선 정리" /><p className="sub">구글 지도 키를 연결하면 쓸 수 있어요.</p></>);
  if (geoIdx.length < 2)
    return (
      <>
        <SheetHead title="동선 정리" />
        <p className="sub" style={{ margin: 0 }}>위치를 고른 일정이 2곳 이상 있어야 해요. 일정을 눌러 장소를 검색해서 골라주세요.</p>
      </>
    );

  const saved = plan ? Math.round(plan.before - plan.after) : 0;
  return (
    <>
      <SheetHead title={`동선 정리 · ${mdw(date)}`} />
      {err ? (
        <p className="err" style={{ margin: 0 }}>{err}</p>
      ) : !plan ? (
        <p className="sub" style={{ margin: 0 }}><span className="spin" /> 장소 사이 이동 시간을 계산하고 있어요…</p>
      ) : (
        <>
          <div className="route-sum">
            <div><small>지금 순서</small><b className="num">{dur(Math.round(plan.before))}</b></div>
            <Icon name="chev" />
            <div><small>정리하면</small><b className="num">{dur(Math.round(plan.after))}</b></div>
          </div>
          <p className="sub" style={{ margin: 0 }}>{saved > 0 ? `이동 시간이 ${dur(saved)} 줄어요.` : '이미 이동이 가장 짧은 순서예요.'} 🔒 표시는 항공·숙소·예약처럼 고정된 일정이에요.</p>
          <ol className="route-list">
            {plan.order.map((i, k) => {
              const p = items[i];
              const leg = k > 0 ? plan.legAt(plan.order[k - 1], i) : null;
              return (
                <li key={p.id}>
                  {leg && <span className="route-leg">{MODES[leg.mode]} {dur(leg.min)}</span>}
                  <span className="route-row">
                    <b className="num">{k + 1}</b>
                    <span>{p.title}</span>
                    {plan.fixedPos[i] && <span aria-label="고정">🔒</span>}
                  </span>
                </li>
              );
            })}
          </ol>
          <label className="check-row">
            <input type="checkbox" checked={retime} onChange={(e) => setRetime(e.target.checked)} />
            시간도 자동으로 맞추기 (머무는 시간 + 이동 시간)
          </label>
          <button className="primary" onClick={() => apply(plan.order)}>{saved > 0 ? '이 순서로 바꾸기' : '이동 시간만 채우기'}</button>
          {saved > 0 && <button className="sec-btn" onClick={() => apply(items.map((_, i) => i))}>순서는 그대로, 이동 시간만 채우기</button>}
        </>
      )}
    </>
  );
}

/* ================= 구글 테이크아웃 가져오기 ================= */
interface Cand {
  key: string;
  name: string;
  addr: string;
  url: string;
  note: string;
  geo: Geo | null;
  on: boolean;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function km(a: [number, number], b: Geo) {
  const R = 6371;
  const dLat = ((b.lat - a[0]) * Math.PI) / 180;
  const dLng = ((b.lng - a[1]) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function readFile(text: string, name: string): Omit<Cand, 'on'>[] {
  const out: Omit<Cand, 'on'>[] = [];
  if (/\.csv$/i.test(name) || !text.trim().startsWith('{')) {
    const rows = parseCSV(text);
    const head = rows[0]?.map((h) => h.trim().toLowerCase()) ?? [];
    const ti = head.findIndex((h) => h === 'title' || h === '제목');
    const ni = head.findIndex((h) => h === 'note' || h === '메모');
    const ui = head.findIndex((h) => h === 'url');
    for (const r of rows.slice(1)) {
      const name = (r[ti >= 0 ? ti : 0] ?? '').trim();
      if (!name) continue;
      out.push({ key: uid(), name, addr: '', url: (r[ui] ?? '').trim(), note: (r[ni] ?? '').trim(), geo: null });
    }
    return out;
  }
  const j = JSON.parse(text) as { features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, unknown> }[] };
  for (const f of j.features ?? []) {
    const pr = (f.properties ?? {}) as { Title?: string; name?: string; google_maps_url?: string; Comment?: string; location?: { name?: string; address?: string } };
    const name = pr.location?.name || pr.Title || pr.name || pr.location?.address || '';
    if (!name) continue;
    const c = f.geometry?.coordinates;
    const geo = c && (c[0] || c[1]) ? { lat: c[1], lng: c[0], addr: pr.location?.address } : null;
    out.push({ key: uid(), name, addr: pr.location?.address ?? '', url: pr.google_maps_url ?? '', note: pr.Comment ?? '', geo });
  }
  return out;
}

export function ImportSheet({ trip }: { trip: Trip }) {
  const { close, toast } = useUI();
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const center = COUNTRY[trip.country].center;

  async function onFile(files?: FileList | null) {
    if (!files?.length) return;
    setErr('');
    try {
      const texts: [string, string][] = [];
      for (const f of Array.from(files)) {
        if (/\.zip$/i.test(f.name)) {
          // 테이크아웃 압축 파일을 그대로 받아서 안에 있는 지도 목록만 꺼내요
          const { unzipSync, strFromU8 } = await import('fflate');
          const all = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => /\.(csv|json|geojson)$/i.test(e.name) && !/(^|\/)\./.test(e.name) });
          for (const [name, u8] of Object.entries(all)) {
            const t = strFromU8(u8).replace(/^\uFEFF/, '');
            // 저장 목록 CSV(Title 열)와 지도 GeoJSON만 골라요. 다른 서비스 파일은 건너뛰어요
            if (/\.csv$/i.test(name) ? /^\s*"?(title|제목)/i.test(t) : t.includes('"features"')) texts.push([t, name]);
          }
        } else texts.push([await f.text(), f.name]);
      }
      const byName = new Map<string, Cand>();
      for (const [t, name] of texts) {
        let got: Omit<Cand, 'on'>[] = [];
        try {
          got = readFile(t, name);
        } catch {}
        for (const c of got) if (!byName.has(c.name)) byName.set(c.name, { ...c, on: false });
      }
      const list = [...byName.values()];
      if (!list.length) return setErr('여기서 장소를 찾지 못했어요. 테이크아웃 압축 파일(.zip)이나 "저장됨" 목록 CSV를 골라주세요.');
      const seen = new Set(trip.wish.map((w) => w.title));
      setCands(list.map((c) => ({ ...c, on: !seen.has(c.name) && (!c.geo || km(center, c.geo) < 300) })));
    } catch {
      setErr('파일을 읽지 못했어요.');
    }
  }

  async function doImport() {
    if (!cands) return;
    const picked = cands.filter((c) => c.on);
    const out: Wish[] = [];
    for (let i = 0; i < picked.length; i++) {
      const c = picked[i];
      let geo = c.geo;
      if (!geo && mapsEnabled) {
        setBusy(`위치 찾는 중 ${i + 1}/${picked.length}`);
        try {
          const h = (await searchPlaces(c.name, center))[0];
          if (h) geo = { lat: h.lat, lng: h.lng, placeId: h.placeId, addr: h.addr };
        } catch {}
      }
      out.push({ id: uid(), title: c.name, type: 'sight' as Cat, url: c.url, place: c.name, note: c.note, planId: null, geo });
    }
    updateTrip(trip.id, (t) => void t.wish.unshift(...out.reverse()));
    setBusy('');
    close();
    toast(`${out.length}곳을 가볼 곳에 넣었어요`);
  }

  const n = cands?.filter((c) => c.on).length ?? 0;
  return (
    <>
      <SheetHead title="구글지도 저장 장소 가져오기" />
      {!cands ? (
        <>
          <div className="share-how">
            <b>제일 빠른 방법 · 공유 한 번</b>
            <ol>
              <li>구글지도 앱 → <b>저장됨</b> → 가져올 목록 열기</li>
              <li><b>공유</b> → <b>우리 여행</b> 누르기</li>
            </ol>
            <p>목록 안 장소가 전부 담아둔 곳으로 들어와요. 장소 하나도 같은 방법으로 보낼 수 있어요.</p>
          </div>
          <details className="more">
            <summary>
              목록 전체를 파일로 옮기기 <span>›</span>
            </summary>
            <ol className="howto">
              <li><a href="https://takeout.google.com/settings/takeout/custom/maps,saved" target="_blank" rel="noopener noreferrer">구글 테이크아웃</a>에서 내보내기</li>
              <li>메일로 온 <b>.zip 파일을 그대로</b> 아래에 올리기 (압축 안 풀어도 돼요)</li>
            </ol>
            <label className="dropzone">
              <input type="file" multiple accept=".zip,.csv,.json,.geojson,application/zip,text/csv,application/json" onChange={(e) => onFile(e.target.files)} />
              <b>파일 고르기</b>ZIP · CSV · JSON
            </label>
          </details>
          {err && <p className="err">{err}</p>}
        </>
      ) : (
        <>
          <p className="sub" style={{ margin: 0 }}>{cands.length}곳을 찾았어요. 이 여행 근처({COUNTRY[trip.country].name})이고 아직 없는 곳만 미리 골라뒀어요.</p>
          <div className="seg full">
            <button type="button" onClick={() => setCands(cands.map((c) => ({ ...c, on: true })))}>모두 선택</button>
            <button type="button" onClick={() => setCands(cands.map((c) => ({ ...c, on: false })))}>모두 해제</button>
          </div>
          <ul className="imp-list">
            {cands.map((c) => (
              <li key={c.key}>
                <label className="check-row">
                  <input type="checkbox" checked={c.on} onChange={(e) => setCands(cands.map((x) => (x.key === c.key ? { ...x, on: e.target.checked } : x)))} />
                  <span><b>{c.name}</b>{(c.addr || c.url) && <small>{c.addr || host(c.url)}</small>}</span>
                </label>
              </li>
            ))}
          </ul>
          <button className="primary" disabled={!n || !!busy} onClick={doImport}>{busy || `${n}곳 가져오기`}</button>
        </>
      )}
    </>
  );
}


/* ================= 순서 직접 바꾸기 ================= */
export function ReorderSheet({ trip, date }: { trip: Trip; date: string }) {
  const { close, toast } = useUI();
  const items = useMemo(() => dayItems(trip, date), [trip, date]);
  const [ids, setIds] = useState(() => items.map((p) => p.id));
  const [retime, setRetime] = useState(true);
  const [drag, setDrag] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const byId = useMemo(() => new Map(items.map((p) => [p.id, p])), [items]);
  const changed = ids.some((id, i) => id !== items[i]?.id);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return;
    const n = [...ids];
    const [x] = n.splice(from, 1);
    n.splice(to, 0, x);
    setIds(n);
  };

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !listRef.current) return;
    const rows = [...listRef.current.querySelectorAll<HTMLElement>('[data-id]')];
    const to = rows.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    move(ids.indexOf(drag), to < 0 ? ids.length - 1 : Math.max(0, to - (to > ids.indexOf(drag) ? 1 : 0)));
  }

  function save() {
    const before = new Map(items.map((p, i) => [p.id, items[i - 1]?.id]));
    updateTrip(trip.id, (t) => {
      writeOrder(t, ids);
      let prev: PlanItem | null = null;
      for (const id of ids) {
        const p = t.plan.find((x) => x.id === id)!;
        // 앞 일정이 바뀌었으면 자동으로 계산했던 이동 시간은 더 이상 맞지 않음
        if (p.travel?.auto && before.get(id) !== prev?.id) p.travel = null;
        if (retime && prev && !isFixed(t, p)) {
          const at = Math.ceil((mins(prev.time) + stayOf(prev) + (p.travel?.min ?? 0)) / 5) * 5;
          if (at < 24 * 60 && at > mins(p.time)) p.time = hhmm(at);
        }
        prev = p;
      }
    });
    close();
    toast(mapsEnabled ? '순서를 바꿨어요. "동선 정리"로 이동 시간도 채울 수 있어요' : '순서를 바꿨어요');
  }

  return (
    <>
      <SheetHead title={`순서 바꾸기 · ${mdw(date)}`} />
      <p className="sub" style={{ margin: 0 }}>손잡이(☰)를 끌거나 화살표로 옮기세요.</p>
      <ol className="reorder" ref={listRef} onPointerMove={onPointerMove} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
        {ids.map((id, k) => {
          const p = byId.get(id)!;
          return (
            <li key={id} data-id={id} className={drag === id ? 'dragging' : ''}>
              <span
                className="handle"
                aria-hidden
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.currentTarget.closest('ol') as HTMLElement).setPointerCapture(e.pointerId);
                  setDrag(id);
                }}
              >
                ☰
              </span>
              <b className="num">{k + 1}</b>
              <span className="ro-t">
                {p.title}
                <small className="num">{p.time}{isFixed(trip, p) ? ' · 고정' : ''}</small>
              </span>
              <button type="button" aria-label={`${p.title} 위로`} disabled={k === 0} onClick={() => move(k, k - 1)}>↑</button>
              <button type="button" aria-label={`${p.title} 아래로`} disabled={k === ids.length - 1} onClick={() => move(k, k + 1)}>↓</button>
            </li>
          );
        })}
      </ol>
      <label className="check-row">
        <input type="checkbox" checked={retime} onChange={(e) => setRetime(e.target.checked)} />
        순서에 맞게 시간도 뒤로 밀기 (고정 일정은 그대로)
      </label>
      <button className="primary" disabled={!changed} onClick={save}>이 순서로 저장</button>
    </>
  );
}
