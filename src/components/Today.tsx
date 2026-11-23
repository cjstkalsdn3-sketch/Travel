'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { ccStyle, useUI } from './ui';
import { BookingView, PlanSheet } from './sheets';
import { bookingOf, dayItems, estMin, exitGeo, stayOf } from '@/lib/plan';
import { COUNTRY, MODES } from '@/lib/constants';
import type { Geo, Mode, PlanItem, Trip } from '@/lib/types';
import { dur, mapUrl, mins } from '@/lib/utils';

/** 여행지 시간 기준 지금 날짜(YYYY-MM-DD)와 분 */
export function tripNow(tzid: string): { date: string; min: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tzid, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

export function useTripNow(t: Trip) {
  const tz = COUNTRY[t.country].tzid;
  const [now, setNow] = useState(() => tripNow(tz));
  useEffect(() => {
    const tick = () => setNow(tripNow(tz));
    tick();
    const h = setInterval(tick, 20000);
    const vis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(h); document.removeEventListener('visibilitychange', vis); };
  }, [tz]);
  return now;
}

const GMODE: Record<Mode, string> = { subway: 'transit', train: 'transit', bus: 'transit', walk: 'walking', taxi: 'driving' };

/** 구글 지도 길찾기 (출발지는 내 위치) */
function dirUrl(p: PlanItem, mode?: Mode) {
  const g: Geo | null | undefined = p.geo ?? p.stops?.find((s) => s.geo)?.geo;
  const q = p.place || p.title;
  if (!g && !q) return mapUrl(p.title);
  const dest = g ? `destination=${g.lat},${g.lng}${g.placeId ? '&destination_place_id=' + encodeURIComponent(g.placeId) : ''}` : 'destination=' + encodeURIComponent(q);
  return `https://www.google.com/maps/dir/?api=1&${dest}&travelmode=${GMODE[mode ?? 'subway']}`;
}

/** "12분 뒤", "1시간 5분 뒤" */
const inMin = (m: number) => (m <= 0 ? '지금' : dur(m) + ' 뒤');

/**
 * 여행 중 오늘: 지금 하는 일정, 다음 일정, 언제 나가야 하는지, 길찾기 한 번에.
 */
export function NowCard({ trip: t, date, onDay }: { trip: Trip; date: string; onDay?: (d: string) => void }) {
  const now = useTripNow(t);
  const { open } = useUI();
  if (date !== now.date || date < t.start || date > t.end) return null;
  const items = dayItems(t, date).filter((p) => /^\d\d:\d\d$/.test(p.time));
  const n = now.min;
  const curIdx = items.findLastIndex((p) => mins(p.time) <= n && n < mins(p.time) + Math.max(stayOf(p), 15));
  const cur = curIdx >= 0 ? items[curIdx] : null;
  const nextIdx = items.findIndex((p) => mins(p.time) > n);
  const next = nextIdx >= 0 ? items[nextIdx] : null;
  const prev = next ? items[nextIdx - 1] : null;
  // 이동 시간: 저장된 값, 없으면 앞 일정에서 거리로 어림
  const move = next ? (next.travel?.min ?? (prev ? estMin(exitGeo(prev), next.geo) : 0)) : 0;
  const leaveAt = next ? mins(next.time) - move : 0;
  const leaveIn = leaveAt - n;
  const late = next && move > 0 && leaveIn < 0;

  if (!items.length) return null;
  const tomorrow = !next && !cur ? dayItems(t, nextDate(date)).find((p) => p.time) : undefined;

  const bk = (p: PlanItem) => bookingOf(t, p);
  return (
    <section className="now" aria-label="지금">
      {cur && (
        <button className="now-cur" style={ccStyle(cur.type)} onClick={() => open(<PlanSheet trip={t} id={cur.id} />)}>
          <span className="now-tag"><span className="now-live" />지금</span>
          <b>{cur.title}</b>
          <small>{cur.time}부터{next ? ` · ${inMin(Math.max(0, leaveAt - n))} 나서면 돼요` : ''}</small>
        </button>
      )}
      {next ? (
        <div className="now-next" style={ccStyle(next.type)}>
          <button className="now-main" onClick={() => open(<PlanSheet trip={t} id={next.id} />)}>
            <span className="now-tag">다음 · {next.time}</span>
            <b>{next.title}</b>
            {next.place && next.place !== next.title && <small>{next.place}</small>}
          </button>
          <div className={'now-leave' + (late ? ' late' : leaveIn <= 15 && move > 0 ? ' soon' : '')}>
            <Icon name="clock" />
            {move > 0 ? (
              late ? (
                <span><b>{dur(-leaveIn)} 늦었어요</b> · {next.travel ? MODES[next.travel.mode] : '이동'} {dur(move)}</span>
              ) : (
                <span><b>{leaveIn <= 0 ? '지금 나가야 해요' : `${hhmmOf(leaveAt)}에 출발`}</b>{leaveIn > 0 && ` · ${inMin(leaveIn)}`} · {next.travel ? MODES[next.travel.mode] : '이동'} {dur(move)}{!next.travel ? ' 쯤' : ''}</span>
              )
            ) : (
              <span><b>{inMin(mins(next.time) - n)}</b> 시작</span>
            )}
          </div>
          <div className="now-acts">
            <a className="now-go" target="_blank" rel="noopener noreferrer" href={dirUrl(next, next.travel?.mode)}>
              <Icon name="map" />길찾기
            </a>
            {bk(next) && (
              <button className="bkchip" onClick={() => open(<BookingView trip={t} id={bk(next)!.id} />)}>
                <Icon name="ticket" />예약 <code>{bk(next)!.code}</code>
              </button>
            )}
          </div>
        </div>
      ) : cur ? (
        <p className="now-end">오늘 마지막 일정이에요.</p>
      ) : (
        <div className="now-done">
          <b>오늘 일정 끝! 수고했어요</b>
          {tomorrow && onDay && (
            <button className="link-btn" onClick={() => onDay(tomorrow.date)}>내일 {tomorrow.time} {tomorrow.title} <Icon name="chev" size={13} /></button>
          )}
        </div>
      )}
    </section>
  );
}

const hhmmOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function nextDate(d: string) {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + 1);
  return x.toISOString().slice(0, 10);
}
