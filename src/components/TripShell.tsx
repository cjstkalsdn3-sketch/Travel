'use client';

import { syncRate } from '@/lib/fx';
import { syncWeather } from '@/lib/weather';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect } from 'react';
import { Icon } from './Icon';
import { useUI } from './ui';
import { ExpenseSheet, TripSheet } from './sheets';
import { useHydrated, useTrip } from '@/lib/store';
import type { Trip } from '@/lib/types';
import { dday, md } from '@/lib/utils';

const TripCtx = createContext<Trip | null>(null);
export const useCurrentTrip = () => useContext(TripCtx)!;

const TABS = [
  ['', 'cal', '일정'],
  ['wish', 'heart', '가볼 곳'],
  ['money', 'wallet', '예산'],
  ['check', 'list', '준비물'],
  ['info', 'ticket', '예약·정보'],
] as const;

export function TripShell({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const t = useTrip(id);
  const hydrated = useHydrated();
  const path = usePathname();
  const router = useRouter();
  const { open } = useUI();
  const base = `/trips/${id}`;
  const tab = path.slice(base.length + 1);

  // 실제 날씨·환율 받아오기 (각 모듈이 너무 자주 받지 않게 알아서 거름)
  useEffect(() => {
    if (!hydrated || !t) return;
    syncWeather(t);
    syncRate(t);
  }, [hydrated, t]);

  if (!hydrated) return <main className="shell" />;
  if (!t)
    return (
      <main className="shell">
        <div className="empty" style={{ marginTop: 40 }}>
          <b>여행을 찾을 수 없어요</b>
          삭제됐거나 다른 기기에서만 만든 여행이에요.
          <p><Link href="/" className="link-btn">홈으로</Link></p>
        </div>
      </main>
    );

  const dd = dday(t);
  const showFab = tab === '' || tab === 'money';
  return (
    <TripCtx.Provider value={t}>
      <main className={'shell trip t-' + (tab || 'plan')}>
        <header className="trip-h">
          <Link className="icon-btn" href="/" aria-label="홈으로"><Icon name="back" /></Link>
          <div className="t">
            <h1>{t.name}</h1>
            <p>{md(t.start)} – {md(t.end)} · {dd.txt}</p>
          </div>
          <button className="icon-btn" onClick={() => open(<TripSheet trip={t} />)} aria-label="여행 설정"><Icon name="more" /></button>
        </header>
        {children}
      </main>
      {showFab && (
        <button className="fab" onClick={() => open(<ExpenseSheet trip={t} onSaved={() => tab === '' && router.push(`${base}/money`)} />)}>
          <Icon name="plus" />지출
        </button>
      )}
      <div className="tabbar">
        <Link className="rail-home" href="/" aria-label="홈으로">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={44} height={44} />
        </Link>
        <nav>
          {TABS.map(([k, icon, label]) => (
            <Link key={k} className={'tab' + (tab === k ? ' on' : '')} href={k ? `${base}/${k}` : base} aria-current={tab === k ? 'page' : undefined} replace scroll>
              <Icon name={icon} />{label}
            </Link>
          ))}
        </nav>
      </div>
    </TripCtx.Provider>
  );
}
