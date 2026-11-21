'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useUI } from './ui';
import { importShared } from '@/lib/importer';
import { useData, useHydrated } from '@/lib/store';
import type { Trip } from '@/lib/types';
import { md, today } from '@/lib/utils';

/**
 * 안드로이드 "공유하기 → 우리 여행"으로 들어오는 곳.
 * 구글지도에서 장소나 저장 목록을 공유하면, 가장 가까운 여행의 담아둔 장소에 바로 넣고 일정 화면으로 보낸다.
 */
export function ShareInbox() {
  const q = useSearchParams();
  const text = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n');
  const data = useData();
  const hydrated = useHydrated();
  const router = useRouter();
  const { toast } = useUI();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const done = useRef(false);

  const T = today();
  const live = [...data.trips].filter((t) => t.end >= T).sort((a, b) => a.start.localeCompare(b.start));

  async function go(t: Trip) {
    if (done.current) return;
    done.current = true;
    setBusy(true);
    const r = await importShared(t, text);
    setBusy(false);
    if (r.err) {
      done.current = false;
      return setErr(r.err);
    }
    toast(r.added.length ? `${r.added.length}곳을 담았어요${r.dup ? ` · ${r.dup}곳은 이미 있어요` : ''}` : '이미 담아둔 곳이에요');
    router.replace(`/trips/${t.id}`);
  }

  // 다가오는 여행이 하나뿐이면 묻지 않고 바로 담음
  useEffect(() => {
    if (!(hydrated && live.length === 1 && text)) return;
    const id = setTimeout(() => void go(live[0]), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  if (!hydrated) return <main className="shell" />;
  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">공유받은 장소</p>
          <h1 className="h1">어느 여행에 담을까요?</h1>
        </div>
      </header>
      {!text ? (
        <div className="empty"><b>받은 내용이 없어요</b>구글지도에서 장소를 열고 공유 → 우리 여행을 눌러보세요.</div>
      ) : busy ? (
        <div className="empty"><b>장소를 읽는 중이에요…</b>{text.split('\n')[0]}</div>
      ) : (
        <>
          {err && <p className="err">{err}</p>}
          <div className="list">
            {(live.length ? live : data.trips).map((t) => (
              <button key={t.id} className="xrow" onClick={() => go(t)}>
                <span className="cat-ic" style={{ ['--cc' as string]: 'var(--accent)' }}><Icon name="flight" /></span>
                <span className="t"><b>{t.name}</b><small>{md(t.start)} – {md(t.end)}</small></span>
                <Icon name="chev" />
              </button>
            ))}
          </div>
          {!data.trips.length && <div className="empty"><b>여행이 아직 없어요</b><Link href="/" className="link-btn">여행 만들기</Link></div>}
        </>
      )}
    </main>
  );
}
