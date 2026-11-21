'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from './Icon';
import { useInstall } from './Pwa';
import { useCopy, useUI } from './ui';
import { PeopleSheet, TripSheet } from './sheets';
import { COUNTRY, WD } from '@/lib/constants';
import { sampleTrip } from '@/lib/sample';
import { clearLegacy, legacyTrips, update, useData, useHydrated, useSession } from '@/lib/store';
import type { Trip } from '@/lib/types';
import { daysOf, dday, krw, md, pd, today, totals } from '@/lib/utils';

export function Home() {
  const data = useData();
  const hydrated = useHydrated();
  const session = useSession();
  const { open, toast } = useUI();
  const copy = useCopy();
  if (!hydrated) return <main className="shell" />;
  const legacy = session.status === 'ready' ? legacyTrips() : [];
  const T = today();
  const d = pd(T);
  const ts = [...data.trips].sort((a, b) => a.start.localeCompare(b.start));
  const up = ts.filter((t) => t.end >= T);
  const past = ts.filter((t) => t.end < T).reverse();
  const { m, g } = data.people;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">{d.getMonth() + 1}월 {d.getDate()}일 {WD[d.getDay()]}요일</p>
          <h1 className="h1">우리 여행</h1>
        </div>
        <button className="duo" onClick={() => open(<PeopleSheet />)} aria-label={`${m.name}, ${g.name} 이름 바꾸기`}>
          <span className="av m">{m.name.slice(0, 1)}</span>
          <span className="av g">{g.name.slice(0, 1)}</span>
        </button>
      </header>

      {session.offline && <div className="hint bad" role="status"><Icon name="info" />인터넷이 끊겨 있어요. 바꾼 내용은 연결되면 자동으로 올라가요.</div>}
      <InstallCard />
      {session.status === 'ready' && session.partnerJoined === false && session.inviteCode && (
        <section className="card invite">
          <div>
            <small>{g.name}에게 이 코드를 보내주세요</small>
            <b className="num">{session.inviteCode}</b>
            <p className="note" style={{ margin: 0 }}>앱에서 가입한 뒤 &quot;초대 코드 받았어요&quot;에 넣으면 같은 여행을 같이 봐요.</p>
          </div>
          <button className="pill-btn" onClick={() => copy(session.inviteCode!)}>복사</button>
        </section>
      )}
      {legacy.length > 0 && (
        <section className="card invite">
          <div>
            <small>로그인 전에 이 폰에만 저장한 여행</small>
            <b style={{ fontSize: 16 }}>{legacy.length}개를 함께 쓰는 공간으로 옮길까요?</b>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className="pill-btn"
              onClick={() => {
                const ids = new Set(data.trips.map((t) => t.id));
                update((x) => void x.trips.push(...legacy.filter((t) => !ids.has(t.id))));
                clearLegacy();
                toast('여행을 옮겼어요');
              }}
            >
              옮기기
            </button>
            <button className="edit-s" onClick={clearLegacy}>안 옮김</button>
          </div>
        </section>
      )}

      {up[0] ? (
        <Pass t={up[0]} />
      ) : (
        <div className="empty">
          <b>{data.trips.length ? '다가오는 여행이 없어요' : '첫 여행을 만들어볼까요?'}</b>
          일정, 예산, 준비물을 둘이 같이 챙겨요.
        </div>
      )}

      {up.length > 1 && (
        <section className="sec">
          <div className="sec-h"><h2>그다음 여행</h2></div>
          <div className="list">{up.slice(1).map((t) => <Row key={t.id} t={t} />)}</div>
        </section>
      )}
      {past.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>지난 여행</h2><small>{past.length}번</small></div>
          <div className="list">{past.map((t) => <Row key={t.id} t={t} />)}</div>
        </section>
      )}

      <button className="ghost-btn" onClick={() => open(<TripSheet />)}>+ 새 여행 만들기</button>
      {data.trips.length === 0 && (
        <p className="demo">
          어떻게 생겼는지 먼저 보고 싶다면{' '}
          <button
            onClick={() => {
              update((x) => void x.trips.push(sampleTrip()));
              toast('예시 여행을 넣었어요. 다 보면 여행 설정에서 지우면 돼요.');
            }}
          >
            예시 여행 둘러보기
          </button>
        </p>
      )}
    </main>
  );
}

function Pass({ t }: { t: Trip }) {
  const dd = dday(t);
  const T = totals(t);
  const n = daysOf(t).length;
  const ck = t.check.filter((c) => c.done).length;
  return (
    <Link className="pass" href={`/trips/${t.id}`}>
      <div className="pass-main">
        <div className="pass-row">
          <span className={'pill ' + dd.cls}>{dd.txt}</span>
          <span className="muted" style={{ fontSize: 13 }}>{md(t.start)} – {md(t.end)} · {n - 1}박 {n}일</span>
        </div>
        {t.from && t.to && (
          <div className="route">
            <div><b>{t.from}</b><small>{t.fromName}</small></div>
            <div className="route-line"><Icon name="plane2" /></div>
            <div className="r"><b>{t.to}</b><small>{t.toName || COUNTRY[t.country].name}</small></div>
          </div>
        )}
        <h2 className="pass-name">{t.name}</h2>
      </div>
      <div className="perf" />
      <div className="stub">
        <div><small>일정</small><b>{t.plan.length}개</b></div>
        <div><small>예산 사용</small><b>{t.budget ? Math.round((T.spent / t.budget) * 100) : 0}%</b></div>
        <div><small>준비물</small><b>{ck}/{t.check.length}</b></div>
      </div>
    </Link>
  );
}

function Row({ t }: { t: Trip }) {
  const n = daysOf(t).length;
  return (
    <Link className="trow" href={`/trips/${t.id}`}>
      <span className="code">{t.to || t.cur}</span>
      <span className="t">
        <b>{t.name}</b>
        <small>{pd(t.start).getFullYear()}. {md(t.start)} – {md(t.end)} · {n - 1}박 {n}일 · {krw(totals(t).spent)}</small>
      </span>
      <Icon name="chev" className="chev" />
    </Link>
  );
}

const DISMISS_KEY = 'trip.installDismissed';
function InstallCard() {
  const { state, install } = useInstall();
  const { toast } = useUI();
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (state !== 'ready' || hidden) return null;
  return (
    <section className="card install">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={44} height={44} />
      <div>
        <b>앱으로 설치하기</b>
        <small>홈 화면에서 바로 열리고, 인터넷이 없어도 볼 수 있어요.</small>
      </div>
      <div className="install-acts">
        <button className="pill-btn" onClick={async () => (await install()) && toast('설치했어요. 홈 화면에서 열어보세요')}>설치</button>
        <button
          className="link-btn"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(DISMISS_KEY, '1');
            } catch {}
          }}
        >
          나중에
        </button>
      </div>
    </section>
  );
}
