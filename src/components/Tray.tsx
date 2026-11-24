'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ccStyle, SheetHead, useUI } from './ui';
import { WishSheet } from './sheets';
import { importShared } from '@/lib/importer';
import { autoPlace, dayItems, placeBest, unplaced, wishScore, type AutoResult } from '@/lib/plan';
import { updateTrip, useData, useSession, useTrip } from '@/lib/store';
import type { Cat, Person, Trip, Wish } from '@/lib/types';
import { daysOf, mdw, pd } from '@/lib/utils';
import { WD } from '@/lib/constants';

/* ================= 끌어다 놓기 ================= */

export interface DragSrc {
  kind: 'wish' | 'plan';
  id: string;
  title: string;
  type: Cat;
}
export type Over = { zone: 'tl'; idx: number; y: number; left: number; width: number } | { zone: 'tray' } | null;

const HOLD_MS = 280;
const SLOP = 9;

/** 되돌리기용으로 일정·가볼 곳을 통째로 기억 */
export function snapshot(t: Trip) {
  const s = JSON.parse(JSON.stringify({ plan: t.plan, wish: t.wish })) as Pick<Trip, 'plan' | 'wish'>;
  return () =>
    updateTrip(t.id, (x) => {
      x.plan = s.plan;
      x.wish = s.wish;
    });
}

/**
 * 꾹 눌러서 집고, 끌어서 놓는다.
 * - 누르고 있다가 손가락을 움직이면 그냥 스크롤
 * - 0.28초 가만히 누르면 집힘 (진동) → 그때부터 화면 스크롤을 막고 따라다님
 */
export function useDragBoard({ onDrop, onDayHover }: { onDrop: (src: DragSrc, over: Over) => void; onDayHover: (date: string) => void }) {
  const [drag, setDrag] = useState<(DragSrc & { x: number; y: number }) | null>(null);
  const [over, setOver] = useState<Over>(null);
  const live = useRef<{ src: DragSrc; x: number; y: number; over: Over } | null>(null);
  const pending = useRef<{ x0: number; y0: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const justDragged = useRef(false);
  const dayHover = useRef<{ date: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cb = useRef({ onDrop, onDayHover });
  useEffect(() => {
    cb.current = { onDrop, onDayHover };
  });

  const hitTest = useCallback((x: number, y: number, src: DragSrc): Over => {
    const tray = document.querySelector('.tray');
    if (tray && src.kind === 'plan') {
      const r = tray.getBoundingClientRect();
      if (y >= r.top - 12 && x >= r.left && x <= r.right) return { zone: 'tray' };
    }
    // 날짜 위에 잠깐 머무르면 그날로 넘어감
    const day = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.day[data-date]');
    const d = day?.dataset.date;
    if (d && !day.classList.contains('on')) {
      if (dayHover.current?.date !== d) {
        if (dayHover.current) clearTimeout(dayHover.current.timer);
        dayHover.current = { date: d, timer: setTimeout(() => cb.current.onDayHover(d), 420) };
      }
    } else if (dayHover.current) {
      clearTimeout(dayHover.current.timer);
      dayHover.current = null;
    }
    const tl = document.querySelector<HTMLElement>('[data-drop="tl"]');
    if (!tl) return null;
    const r = tl.getBoundingClientRect();
    if (y < r.top - 50 || y > r.bottom + 70) return null;
    const evs = [...tl.querySelectorAll<HTMLElement>('li.ev[data-id]')].filter((el) => el.dataset.id !== src.id).map((el) => el.getBoundingClientRect());
    let idx = 0;
    for (const e of evs) if (y > e.top + e.height / 2) idx++;
    const lineY = !evs.length ? r.top + r.height / 2 : idx === 0 ? evs[0].top - 5 : idx >= evs.length ? evs[evs.length - 1].bottom + 5 : (evs[idx - 1].bottom + evs[idx].top) / 2;
    return { zone: 'tl', idx, y: lineY, left: r.left, width: r.width };
  }, []);

  const end = useCallback((commit: boolean) => {
    const l = live.current;
    live.current = null;
    if (dayHover.current) clearTimeout(dayHover.current.timer);
    dayHover.current = null;
    document.documentElement.classList.remove('dragging');
    setDrag(null);
    setOver(null);
    if (l && commit && l.over) cb.current.onDrop(l.src, l.over);
    // 손 뗄 때 생기는 클릭이 시트를 여는 걸 막음
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 350);
  }, []);

  // 집은 동안: 따라다니기 + 스크롤 막기 + 가장자리에서 자동 스크롤
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    let armed = false;
    const move = (e: PointerEvent) => {
      const l = live.current;
      if (!l) return;
      l.x = e.clientX;
      l.y = e.clientY;
      l.over = hitTest(l.x, l.y, l.src);
      setDrag((d) => (d ? { ...d, x: l.x, y: l.y } : d));
      setOver(l.over);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const block = (e: TouchEvent) => e.cancelable && e.preventDefault();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && end(false);
    const tick = () => {
      const l = live.current;
      if (l) {
        // 아래쪽 자동 스크롤은 위젯 바로 위 띠에서만. 위젯에서 집은 직후엔 한 번 위로 올라온 다음부터
        const bottom = document.querySelector('.tray')?.getBoundingClientRect().top ?? window.innerHeight - 90;
        if (l.y < bottom - 80) armed = true;
        const v = l.y < 120 ? -Math.ceil((120 - l.y) / 10) : armed && l.y > bottom - 70 && l.y < bottom ? Math.ceil((l.y - (bottom - 70)) / 8) : 0;
        if (v) {
          window.scrollBy(0, v);
          l.over = hitTest(l.x, l.y, l.src);
          setOver(l.over);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('touchmove', block, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('touchmove', block);
      window.removeEventListener('keydown', key);
    };
    // drag 가 켜지고 꺼질 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag, end, hitTest]);

  /** 집을 수 있는 요소에 붙이는 핸들러 */
  const press = (src: DragSrc) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0 || live.current) return;
      const x = e.clientX, y = e.clientY;
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = {
        x0: x,
        y0: y,
        x,
        y,
        timer: setTimeout(() => {
          const p = pending.current;
          pending.current = null;
          if (!p) return;
          live.current = { src, x: p.x, y: p.y, over: null };
          live.current.over = hitTest(p.x, p.y, src);
          document.documentElement.classList.add('dragging');
          navigator.vibrate?.(12);
          setDrag({ ...src, x: p.x, y: p.y });
          setOver(live.current.over);
        }, HOLD_MS),
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(p.x - p.x0, p.y - p.y0) > SLOP) {
        clearTimeout(p.timer);
        pending.current = null;
      }
    },
    onPointerUp: () => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
    },
    onPointerCancel: () => {
      if (pending.current) clearTimeout(pending.current.timer);
      pending.current = null;
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClickCapture: (e: React.MouseEvent) => {
      if (justDragged.current) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
  });

  const layer = drag && (
    <>
      {over?.zone === 'tl' && <div className="drop-line" style={{ top: over.y, left: over.left, width: over.width }} aria-hidden />}
      <div className="drag-ghost" style={{ ...ccStyle(drag.type), left: drag.x, top: drag.y }} aria-hidden>
        <span className="cat-ic"><Icon name={drag.type} /></span>
        <b>{drag.title}</b>
      </div>
    </>
  );

  return { drag, over, press, layer };
}

/* ================= 담아둔 장소 위젯 ================= */

export function Tray({
  trip,
  date,
  dragging,
  overTray,
  press,
  onHover,
}: {
  trip: Trip;
  date: string;
  dragging: DragSrc | null;
  overTray: boolean;
  press: (src: DragSrc) => object;
  /** 칩을 가리키면 지도에서 그 핀을 보여줌 */
  onHover?: (id: string | null) => void;
}) {
  const { open, toast } = useUI();
  // 꼭 갈 곳 먼저, 시간 되면 갈 곳은 뒤로
  const list = unplaced(trip).sort((a, b) => wishScore(b) - wishScore(a));
  const [busy, setBusy] = useState(false);
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem('trip.trayFolded') === '1';
    } catch {
      return false;
    }
  });
  // 크게 보기: 가로 한 줄 대신 여러 줄로 다 보여줌
  const [big, setBig] = useState(() => {
    try {
      return localStorage.getItem('trip.trayBig') === '1';
    } catch {
      return false;
    }
  });
  const grow = (v: boolean) => {
    setBig(v);
    try {
      localStorage.setItem('trip.trayBig', v ? '1' : '0');
    } catch {}
    if (v && folded) fold(false);
  };
  const fold = (v: boolean) => {
    setFolded(v);
    try {
      localStorage.setItem('trip.trayFolded', v ? '1' : '0');
    } catch {}
  };

  async function paste() {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {}
    if (!text.trim()) return open(<PasteSheet trip={trip} />);
    setBusy(true);
    const r = await importShared(trip, text);
    setBusy(false);
    if (r.err) return open(<PasteSheet trip={trip} initial={text} err={r.err} />);
    toast(r.added.length ? `${r.added.length}곳을 담았어요${r.dup ? ` · ${r.dup}곳은 이미 있어요` : ''}` : '이미 담아둔 곳이에요');
    if (folded) fold(false);
  }

  function auto() {
    open(<AutoSheet trip={trip} />);
  }

  const removing = dragging?.kind === 'plan';
  return (
    <section className={'tray' + (removing ? ' drop' : '') + (overTray ? ' hot' : '') + (folded && !removing ? ' folded' : '') + (big && !folded ? ' big' : '')} aria-label="담아둔 장소">
      {removing ? (
        <div className="tray-drop"><Icon name="x" />여기에 놓으면 일정에서 빼서 다시 담아둬요</div>
      ) : (
        <>
          <div className="tray-h">
            <button className="tray-t" onClick={() => fold(!folded)} aria-expanded={!folded}>
              <b>담아둔 장소</b><span className="num">{list.length}</span>
              <Icon name="chev" />
            </button>
            {list.length > 3 && !folded && (
              <button className="tray-grow" onClick={() => grow(!big)} aria-pressed={big}>
                {big ? '줄이기' : '전체 보기'}
              </button>
            )}
            <div className="tray-acts">
              {list.length > 0 && (
                <button className="tray-btn" onClick={auto}><Icon name="spark" />자동 배치</button>
              )}
              <button className="tray-btn" onClick={paste} disabled={busy}><Icon name="clip" />{busy ? '읽는 중' : '붙여넣기'}</button>
            </div>
          </div>
          {!folded &&
            (list.length ? (
              <ul className="tray-list">
                {list.map((w) => (
                  <li key={w.id}>
                    <button className={'tchip' + (wishScore(w) < 0 ? ' maybe' : '')} style={ccStyle(w.type)} {...press({ kind: 'wish', id: w.id, title: w.title, type: w.type })} onClick={() => open(<PlaceSheet trip={trip} id={w.id} date={date} />)} onMouseEnter={() => onHover?.(w.id)} onMouseLeave={() => onHover?.(null)} onFocus={() => onHover?.(w.id)} onBlur={() => onHover?.(null)}>
                      <span className="cat-ic"><Icon name={w.type} /></span>
                      {wishScore(w) > 0 && <span className="tchip-star" aria-label={wishScore(w) > 1 ? '둘 다 가고 싶은 곳' : '가고 싶은 곳'}>{wishScore(w) > 1 ? '★★' : '★'}</span>}
                      <span className="tchip-t">{w.title}</span>
                      {!w.geo && <span className="tchip-nogeo" title="위치 없음">·</span>}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="tray-empty">구글지도에서 장소를 <b>공유 → 우리 여행</b>으로 보내거나, 링크를 복사하고 <b>붙여넣기</b>를 누르세요.</p>
            ))}
          {!folded && list.length > 0 && <p className="tray-hint">꾹 눌러서 일정에 끌어다 놓아요 · 일정을 꾹 눌러 여기로 끌면 빠져요</p>}
        </>
      )}
    </section>
  );
}

/**
 * 담아둔 곳 우선순위: 둘이 각자 ★ (둘 다 누르면 가장 먼저), 또는 '시간 되면'.
 * 자동 배치가 ★ 많은 곳부터 넣고, 시간 모자라면 '시간 되면'부터 빼요.
 */
export function PrioPick({ trip, id }: { trip: Trip; id: string }) {
  const { people } = useData();
  const me = useSession().me ?? 'm';
  const w = trip.wish.find((x) => x.id === id);
  if (!w) return null;
  const stars = w.stars ?? (w.prio === 1 ? [me] : []);
  const edit = (fn: (x: Wish) => void) =>
    updateTrip(trip.id, (t) => {
      const x = t.wish.find((y) => y.id === id);
      if (x) fn(x);
    });
  const toggle = (who: Person) =>
    edit((x) => {
      const cur = new Set(x.stars ?? (x.prio === 1 ? [me] : []));
      if (cur.has(who)) cur.delete(who);
      else cur.add(who);
      delete x.prio;
      if (cur.size) x.stars = (['m', 'g'] as Person[]).filter((p) => cur.has(p));
      else delete x.stars;
    });
  const order: Person[] = me === 'g' ? ['g', 'm'] : ['m', 'g'];
  return (
    <div className="prio-pick" aria-label="가고 싶은 정도">
      {order.map((who) => (
        <button key={who} type="button" aria-pressed={stars.includes(who)} className="prio-star" onClick={() => toggle(who)}>
          <span aria-hidden>{stars.includes(who) ? '★' : '☆'}</span> {people[who]?.name ?? (who === 'm' ? '나' : '짝꿍')}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={w.prio === -1 && !stars.length}
        className="prio-maybe"
        onClick={() =>
          edit((x) => {
            delete x.stars;
            if (x.prio === -1) delete x.prio;
            else x.prio = -1;
          })
        }
      >
        시간 되면
      </button>
    </div>
  );
}

export function PlaceSheet({ trip: trip0, id, date }: { trip: Trip; id: string; date: string }) {
  const { open, close, toast } = useUI();
  const trip = useTrip(trip0.id) ?? trip0;
  const w = trip.wish.find((x) => x.id === id);
  if (!w) return null;
  const ds = daysOf(trip);
  function put(d: string) {
    const undo = snapshot(trip);
    let time = '';
    updateTrip(trip.id, (t) => void (time = placeBest(t, id, d)?.time ?? ''));
    close();
    toast(`Day ${ds.indexOf(d) + 1} ${time}에 넣었어요`, { label: '되돌리기', run: undo });
  }
  return (
    <>
      <SheetHead title={w.title} />
      {w.geo?.addr && <p className="sub" style={{ margin: 0 }}>{w.geo.addr}</p>}
      <PrioPick trip={trip} id={id} />
      <p className="lbl">어느 날에 넣을까요? 그날 동선에 맞는 자리에 들어가요.</p>
      <div className="daypick">
        {ds.map((d, k) => {
          const x = pd(d);
          return (
            <button key={d} className={'day' + (d === date ? ' on' : '')} onClick={() => put(d)}>
              <small>DAY {k + 1}</small><b>{x.getDate()}</b><small>{WD[x.getDay()]}</small>
            </button>
          );
        })}
      </div>
      <div className="row2">
        <button className="ghost-btn" onClick={() => open(<WishSheet trip={trip} id={id} />)}>고치기</button>
        <button
          className="ghost-btn"
          onClick={() => {
            const undo = snapshot(trip);
            updateTrip(trip.id, (t) => void (t.wish = t.wish.filter((x) => x.id !== id)));
            close();
            toast('지웠어요', { label: '되돌리기', run: undo });
          }}
        >
          지우기
        </button>
      </div>
    </>
  );
}

/** 클립보드를 못 읽을 때 직접 붙여넣기 */
export function PasteSheet({ trip, initial = '', err: err0 = '' }: { trip: Trip; initial?: string; err?: string }) {
  const { close, toast } = useUI();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState(err0);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await importShared(trip, v);
    setBusy(false);
    if (r.err) return setErr(r.err);
    close();
    toast(r.added.length ? `${r.added.length}곳을 담았어요` : '이미 담아둔 곳이에요');
  }
  return (
    <>
      <SheetHead title="장소 담기" />
      <p className="sub" style={{ margin: 0 }}>구글지도 장소 링크, 저장 목록 링크, 장소 이름 다 돼요.</p>
      <textarea className="inp" rows={3} placeholder="https://maps.app.goo.gl/…" value={v} onChange={(e) => (setV(e.target.value), setErr(''))} autoFocus />
      {err && <p className="err">{err}</p>}
      <button className="primary" onClick={go} disabled={busy || !v.trim()}>{busy ? '읽는 중…' : '담기'}</button>
    </>
  );
}

const leftText = (r: AutoResult) =>
  [r.left ? `${r.left}곳은 시간이 모자라 남겨둬요` : '', r.skipped ? `공항 ${r.skipped}곳은 비행기 일정이 없어서 남겨둬요` : ''].filter(Boolean).join(' · ');

/**
 * 자동 배치 미리보기. 바로 넣지 않고 날짜별로 어디에 뭘 넣을지 보여준다.
 * 날마다 지역을 골라 고정하면 그 날은 그 지역으로 다시 짠다.
 */
export function AutoSheet({ trip: trip0 }: { trip: Trip }) {
  const { close, toast } = useUI();
  const trip = useTrip(trip0.id) ?? trip0;
  const [lock, setLock] = useState<Record<string, string>>({});
  const [pickDay, setPickDay] = useState<string | null>(null);
  // 지역 목록은 고정 없이 한 번 짜서 얻고, 고른 지역의 가운데를 그 날 중심으로
  const regions = useMemo(() => autoPlace(JSON.parse(JSON.stringify(trip)) as Trip).regions, [trip]);
  const geoLock = useMemo(() => Object.fromEntries(Object.entries(lock).flatMap(([d, k]) => { const c = regions.find((g) => g.key === k)?.center; return c ? [[d, c]] : []; })), [lock, regions]);
  const { r, days } = useMemo(() => {
    const copy = JSON.parse(JSON.stringify(trip)) as Trip;
    const before = new Set(trip.plan.map((p) => p.id));
    const r = autoPlace(copy, undefined, { lock: geoLock });
    const days = daysOf(copy).map((d) => ({ d, items: dayItems(copy, d), fresh: new Set(dayItems(copy, d).filter((p) => !before.has(p.id)).map((p) => p.id)) }));
    return { r, days };
  }, [trip, geoLock]);
  const label = (key?: string) => regions.find((x) => x.key === key)?.label;
  // 못 넣은 곳을 지역별로. 그 지역이 한 곳도 안 들어갔으면 '통째로 빠짐'
  const leftGroups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const [id, key] of Object.entries(r.leftWish)) {
      const w = trip.wish.find((x) => x.id === id);
      if (w) m.set(key, [...(m.get(key) ?? []), w.title]);
    }
    return [...m].map(([key, titles]) => ({ key, titles, label: key ? label(key) : undefined, whole: !!key && titles.length >= (regions.find((x) => x.key === key)?.count ?? Infinity) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, trip, regions]);

  function apply() {
    const undo = snapshot(trip);
    let res = r;
    updateTrip(trip.id, (t) => void (res = autoPlace(t, undefined, { lock: geoLock })));
    close();
    const more = leftText(res);
    toast(res.n ? `${res.n}곳을 날짜별로 배치했어요${more ? ` · ${more}` : ''}` : more || '넣을 곳이 없어요', res.n ? { label: '되돌리기', run: undo } : undefined);
  }

  return (
    <>
      <SheetHead title="자동 배치 미리보기" />
      <p className="sub" style={{ margin: 0 }}>
        {r.n ? `담아둔 곳 ${r.n}곳을 이렇게 넣어요.` : '넣을 수 있는 곳이 없어요.'} {leftText(r)}
        {regions.length > 1 && ' 날짜의 지역을 눌러 바꿀 수 있어요.'}
      </p>
      <ol className="ap-days">
        {days.map(({ d, items, fresh }, k) => {
          const key = lock[d] ?? r.dayRegion[d];
          const area = !lock[d] ? trip.area?.[d]?.name : undefined;
          return (
            <li key={d} className={fresh.size ? '' : 'quiet'}>
              <div className="ap-h">
                <b>Day {k + 1}</b>
                <small>{mdw(d)}</small>
                {regions.length > 1 ? (
                  <button className={'ap-reg' + (lock[d] || area ? ' on' : '')} onClick={() => setPickDay(pickDay === d ? null : d)} aria-expanded={pickDay === d}>
                    {area ?? label(key) ?? '지역 고르기'}
                    {(lock[d] || area) && ' 📌'}
                    <Icon name="chev" size={14} />
                  </button>
                ) : (
                  (area || key) && <span className="ap-reg plain">{area ?? label(key)}</span>
                )}
              </div>
              {pickDay === d && (
                <div className="ap-pick">
                  {regions.map((g) => (
                    <button key={g.key} className={'tchip' + (lock[d] === g.key ? ' on' : '')} onClick={() => { setLock({ ...lock, [d]: g.key }); setPickDay(null); }}>
                      {g.label} <small>{g.count}곳</small>
                    </button>
                  ))}
                  {lock[d] && (
                    <button className="tchip" onClick={() => { const n = { ...lock }; delete n[d]; setLock(n); setPickDay(null); }}>
                      알아서
                    </button>
                  )}
                </div>
              )}
              <ul className="ap-items">
                {items.map((p) => (
                  <li key={p.id} className={fresh.has(p.id) ? 'new' : ''}>
                    <time className="num">{p.time}</time>
                    <span>
                      {p.title}
                      {!!p.stops?.length && <small> · {p.stops.map((x) => x.name).join(', ')}</small>}
                    </span>
                  </li>
                ))}
                {!items.length && <li className="empty">비어 있어요</li>}
              </ul>
            </li>
          );
        })}
      </ol>
      {leftGroups.length > 0 && (
        <div className="ap-left">
          <b>이번에 못 넣은 곳 {Object.keys(r.leftWish).length}곳</b>
          {leftGroups.map((g) => (
            <div key={g.key} className="ap-left-g">
              <span className="ap-left-h">
                {g.label ?? '그 밖의 곳'}
                {g.whole && <em>지역 통째로 빠짐</em>}
              </span>
              <small>{g.titles.join(', ')}</small>
            </div>
          ))}
          <p className="sub">
            {leftGroups.some((g) => g.whole) ? '날짜가 모자라 빠진 지역이 있어요. 위에서 날짜의 지역을 눌러 바꾸거나, ★를 달아두면 먼저 넣어요.' : '그날 시간이 모자라 남겨둬요. ★를 달아두면 먼저 넣어요.'}
          </p>
        </div>
      )}
      <button className="primary" onClick={apply} disabled={!r.n}>이대로 넣기</button>
    </>
  );
}
