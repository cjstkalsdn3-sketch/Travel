'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Seg, SheetHead, useUI } from './ui';
import { snapshot } from './Tray';
import { nearby, nearScore, type NearHit, type NearKind } from '@/lib/maps';
import { dayItems, km, placeWish } from '@/lib/plan';
import { updateTrip, useTrip } from '@/lib/store';
import type { Cat, Trip } from '@/lib/types';
import { uid } from '@/lib/utils';

const KINDS: [NearKind, string][] = [
  ['food', '맛집'],
  ['cafe', '카페'],
  ['sight', '구경거리'],
  ['bar', '술집'],
];
const catOf = (k: NearKind, kind?: string): Cat => (k === 'sight' ? (kind === 'shopping_mall' ? 'shop' : 'sight') : 'food');
const walk = (m: number) => (m < 1000 ? `걸어서 ${Math.max(1, Math.round(m / 75))}분` : `${(m / 1000).toFixed(1)}km`);

export function NearbySheet({ trip: first, planId }: { trip: Trip; planId: string }) {
  const { toast } = useUI();
  const trip = useTrip(first.id) ?? first;
  const p = trip.plan.find((x) => x.id === planId);
  const [kind, setKind] = useState<NearKind>(p?.type === 'food' ? 'cafe' : 'food');
  const [res, setRes] = useState<{ key: string; list?: NearHit[]; err?: string } | null>(null);
  const at: [number, number] | null = p?.geo ? [p.geo.lat, p.geo.lng] : null;
  const key = at ? `${at.join(',')}:${kind}` : '';

  useEffect(() => {
    if (!at) return;
    let dead = false;
    nearby(at, kind)
      .then((list) => !dead && setRes({ key, list }))
      .catch(() => !dead && setRes({ key, err: '주변 장소를 불러오지 못했어요. 잠시 뒤 다시 해보세요.' }));
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!p || !at)
    return (
      <>
        <SheetHead title="주변 추천" />
        <p className="sub">이 일정에 장소(위치)가 있어야 주변을 찾을 수 있어요.</p>
      </>
    );

  const cur = res?.key === key ? res : null;
  const ranked = (cur?.list ?? [])
    .map((h) => ({ h, d: km(p.geo!, h) * 1000, s: nearScore(h) }))
    .filter((x) => x.h.placeId !== p.geo?.placeId && x.h.name !== p.title);
  const solid = ranked.filter((x) => (x.h.reviews ?? 0) >= 15);
  const list = (solid.length >= 5 ? solid : ranked).sort((a, b) => b.s - a.s).slice(0, 12);
  const saved = new Set(trip.wish.map((w) => w.geo?.placeId).filter(Boolean));

  function addWish(h: NearHit) {
    const id = uid();
    updateTrip(trip.id, (t) =>
      void t.wish.unshift({ id, title: h.name, type: catOf(kind, h.kind), url: h.url ?? '', place: h.name, note: h.summary ?? '', planId: null, geo: { lat: h.lat, lng: h.lng, placeId: h.placeId, addr: h.addr } }),
    );
    return id;
  }
  function putNext(h: NearHit) {
    const undo = snapshot(trip);
    let time = '';
    updateTrip(trip.id, (t) => {
      const id = uid();
      t.wish.unshift({ id, title: h.name, type: catOf(kind, h.kind), url: h.url ?? '', place: h.name, note: h.summary ?? '', planId: null, geo: { lat: h.lat, lng: h.lng, placeId: h.placeId, addr: h.addr } });
      const idx = dayItems(t, p!.date).findIndex((x) => x.id === p!.id);
      time = placeWish(t, id, p!.date, idx + 1)?.time ?? '';
    });
    toast(`${p!.title} 다음 ${time}에 넣었어요`, { label: '되돌리기', run: undo });
  }

  return (
    <>
      <SheetHead title="주변 추천" />
      <p className="sub" style={{ margin: 0 }}>
        <b>{p.title}</b> 근처를 구글 지도 평점과 리뷰 수로 골랐어요.
      </p>
      <Seg full value={kind} onChange={setKind} options={KINDS} />
      {!cur ? (
        <div className="near-load"><span className="spin" /> 찾는 중…</div>
      ) : cur.err ? (
        <p className="err" style={{ margin: 0 }}>{cur.err}</p>
      ) : !list.length ? (
        <div className="map-empty">근처에서 찾지 못했어요.</div>
      ) : (
        <ul className="near-list">
          {list.map(({ h, d }) => {
            const has = !!h.placeId && saved.has(h.placeId);
            return (
              <li key={h.placeId ?? h.name}>
                <div className="near-t">
                  <b>{h.name}</b>
                  <small>
                    {h.rating ? <span className="star">★ {h.rating.toFixed(1)}</span> : null}
                    {h.reviews ? <span>({h.reviews.toLocaleString('ko-KR')})</span> : null}
                    <span>· {walk(d)}</span>
                    {h.price ? <span>· {['', '저렴', '보통', '비싼 편', '고급'][h.price]}</span> : null}
                    {h.open === true && <span className="open">· 영업 중</span>}
                    {h.open === false && <span className="closed">· 영업 끝</span>}
                  </small>
                  {(h.summary || h.type) && <p>{h.summary || h.type}</p>}
                </div>
                <div className="near-acts">
                  <button className="toplan" onClick={() => putNext(h)}>다음 일정으로</button>
                  <button className="edit-s" disabled={has} onClick={() => { addWish(h); toast(`담아뒀어요 · ${h.name}`); }}>
                    {has ? '담아둠' : '담아두기'}
                  </button>
                  {h.url && (
                    <a className="maplink" href={h.url} target="_blank" rel="noopener noreferrer">
                      <Icon name="map" />지도
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
