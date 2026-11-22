'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ConfirmButton, Seg, SheetHead, useUI } from './ui';
import { useCurrentTrip } from './TripShell';
import { dayItems } from '@/lib/plan';
import { photoDay, preparePhoto, queuePhotos, removePhotos, usePhotoUrl, type Prepared } from '@/lib/photos';
import { getSession, updateTrip, useData, useSession, useTrip } from '@/lib/store';
import type { Memo, Person, Photo, Trip } from '@/lib/types';
import { daysOf, mdw, today, uid } from '@/lib/utils';

const memosOf = (t: Trip) => t.memo ?? [];
/** 기록이 놓일 날: 여행 기간 밖이면 가까운 끝 날 */
const dayOf = (t: Trip, d: string) => (d < t.start ? t.start : d > t.end ? t.end : d);
/** 기록을 남길 기본 날짜: 여행 중이면 오늘 */
const defaultDay = (t: Trip) => dayOf(t, today());
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
};

/* ================= 기록 탭 ================= */
export function DiaryTab() {
  const t = useCurrentTrip();
  const { open, toast } = useUI();
  const data = useData();
  const ds = daysOf(t);
  const memos = memosOf(t);
  const [view, setView] = useState<'diary' | 'album'>('diary');
  const [show, setShow] = useState<{ list: Photo[]; i: number } | null>(null);
  const [busy, setBusy] = useState('');
  const photos = memos.flatMap((m) => m.photos);
  const byDay = new Map<string, Memo[]>();
  for (const m of memos) {
    const d = dayOf(t, m.date);
    byDay.set(d, [...(byDay.get(d) ?? []), m]);
  }
  // 최근에 쓴 기록이 아래로 (그날 흐름대로)
  for (const l of byDay.values()) l.sort((a, b) => (a.at < b.at ? -1 : 1));
  const days = ds.filter((d) => byDay.has(d));
  const now = today();
  const during = now >= t.start && now <= t.end;
  if (during && !days.includes(now)) days.push(now);
  days.sort();

  /** 사진 여러 장을 고르면 찍은 날짜별로 기록을 만들어 넣는다 */
  async function bulk(files: FileList | null) {
    if (!files?.length) return;
    const fs = [...files].filter((f) => f.type.startsWith('image/'));
    const ready: Prepared[] = [];
    for (let i = 0; i < fs.length; i++) {
      setBusy(`사진 준비 중 ${i + 1}/${fs.length}`);
      try {
        ready.push(await preparePhoto(fs[i], t.id));
      } catch {}
    }
    setBusy('');
    if (!ready.length) return toast('사진을 읽지 못했어요');
    const groups = new Map<string, Prepared[]>();
    for (const r of ready) {
      const d = photoDay([r.photo], ds) ?? defaultDay(t);
      groups.set(d, [...(groups.get(d) ?? []), r]);
    }
    const me = getSession().me ?? 'm';
    const made: [string, Prepared[]][] = [];
    updateTrip(t.id, (x) => {
      x.memo ??= [];
      for (const [d, list] of groups) {
        list.sort((a, b) => ((a.photo.at ?? '') < (b.photo.at ?? '') ? -1 : 1));
        const id = uid();
        x.memo.push({ id, date: d, by: me, text: '', photos: list.map((r) => r.photo), at: list[0].photo.at ? new Date(list[0].photo.at).toISOString() : new Date().toISOString() });
        made.push([id, list]);
      }
    });
    toast(groups.size > 1 ? `사진 ${ready.length}장을 찍은 날짜별로 넣었어요` : `사진 ${ready.length}장을 넣었어요`);
    for (const [id, list] of made) await queuePhotos(t.id, id, list, toast);
  }

  const bulkBtn = (
    <label className={'import-row diary-bulk' + (busy ? ' busy' : '')}>
      <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => {
          void bulk(e.target.files);
          e.target.value = '';
        }} />
      <Icon name="photo" />
      <span><b>{busy || '사진 한꺼번에 올리기'}</b><small>찍은 날짜를 보고 Day별로 알아서 나눠요</small></span>
      {busy ? <span className="spin" /> : <Icon name="chev" />}
    </label>
  );

  return (
    <>
      <div className="wishtop">
        <div>
          <h2 className="h2">여행 기록</h2>
          <p className="ds">{memos.length ? `사진 ${photos.length}장 · 기록 ${memos.length}개` : '사진과 한 줄로 그날을 남겨요'}</p>
        </div>
        <button className="pill-btn" onClick={() => open(<MemoSheet trip={t} date={defaultDay(t)} />)}>+ 기록</button>
      </div>
      {bulkBtn}
      {memos.length > 0 && <Seg full value={view} onChange={setView} options={[['diary', '일기'], ['album', `앨범 ${photos.length}`]]} />}

      {!memos.length ? (
        <div className="empty">
          <b>아직 남긴 기록이 없어요</b>
          여행하면서 찍은 사진과 짧은 글을 남겨두면, 날짜별 일기와 앨범으로 모아볼 수 있어요.
          <p><button className="link-btn" onClick={() => open(<MemoSheet trip={t} date={defaultDay(t)} />)}>첫 기록 남기기</button></p>
        </div>
      ) : view === 'album' ? (
        <div className="album">
          {ds
            .filter((d) => byDay.get(d)?.some((m) => m.photos.length))
            .map((d) => {
              const list = byDay.get(d)!.flatMap((m) => m.photos);
              return (
                <section key={d}>
                  <h3 className="day-h"><b>Day {ds.indexOf(d) + 1}</b> {mdw(d)} <small>{list.length}장</small></h3>
                  <div className="album-grid">
                    {list.map((p) => (
                      <Thumb key={p.id} p={p} onClick={() => setShow({ list: photos, i: photos.indexOf(p) })} />
                    ))}
                  </div>
                </section>
              );
            })}
          {!photos.length && <div className="empty"><b>아직 사진이 없어요</b>위의 버튼으로 사진을 올려보세요.</div>}
        </div>
      ) : (
        <div className="diary">
          {days.map((d) => (
            <section key={d} className="diary-day">
              <h3 className="day-h">
                <b>Day {ds.indexOf(d) + 1}</b> {mdw(d)}
                {d === now && <span className="pill good">오늘</span>}
                <button className="day-add" onClick={() => open(<MemoSheet trip={t} date={d} />)} aria-label={`Day ${ds.indexOf(d) + 1}에 기록 남기기`}><Icon name="plus" /></button>
              </h3>
              {(byDay.get(d) ?? []).map((m) => (
                <MemoCard key={m.id} t={t} m={m} names={data.people} onPhoto={(i) => setShow({ list: m.photos, i })} onEdit={() => open(<MemoSheet trip={t} id={m.id} />)} />
              ))}
              {!byDay.has(d) && (
                <button className="memo-empty" onClick={() => open(<MemoSheet trip={t} date={d} />)}>
                  오늘은 어땠어요? 사진 한 장, 한 줄이면 충분해요
                </button>
              )}
            </section>
          ))}
        </div>
      )}
      {show && <Viewer list={show.list} start={show.i} onClose={() => setShow(null)} />}
    </>
  );
}

function MemoCard({ t, m, names, onPhoto, onEdit }: { t: Trip; m: Memo; names: Record<Person, { name: string }>; onPhoto: (i: number) => void; onEdit: () => void }) {
  const place = m.planId ? t.plan.find((p) => p.id === m.planId) : undefined;
  const n = m.photos.length;
  const shown = m.photos.slice(0, n > 4 ? 4 : n);
  return (
    <article className={'memo by-' + m.by}>
      <header>
        <span className="author">{names[m.by]?.name ?? ''}</span>
        <span className="when">{hhmm(m.photos[0]?.at ? m.photos[0].at : m.at)}</span>
        {place && <span className="where"><Icon name="sight" size={12} />{place.title}</span>}
        <button className="edit-s" onClick={onEdit}>수정</button>
      </header>
      {n > 0 && (
        <div className={'pgrid n' + Math.min(n, 4)}>
          {shown.map((p, i) => (
            <Thumb key={p.id} p={p} big={n === 1} more={i === 3 && n > 4 ? n - 4 : 0} onClick={() => onPhoto(i)} />
          ))}
        </div>
      )}
      {m.text && <p className="memo-t">{m.text}</p>}
    </article>
  );
}

function Thumb({ p, big, more, onClick }: { p: Photo; big?: boolean; more?: number; onClick?: () => void }) {
  const url = usePhotoUrl(p, big);
  const small = usePhotoUrl(p);
  const src = url ?? small;
  return (
    <button type="button" className="ph" onClick={onClick} style={big ? { aspectRatio: `${p.w} / ${p.h}` } : undefined} aria-label="사진 크게 보기">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" loading="lazy" decoding="async" /> : <span className="ph-wait">{p.up ? '올라가는 중' : ''}</span>}
      {!!more && <span className="ph-more">+{more}</span>}
    </button>
  );
}

/* ================= 사진 크게 보기 ================= */
function Viewer({ list, start, onClose }: { list: Photo[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const p = list[Math.max(0, Math.min(i, list.length - 1))];
  const big = usePhotoUrl(p, true);
  const small = usePhotoUrl(p);
  const x0 = useRef<number | null>(null);
  const go = (d: number) => setI((v) => Math.max(0, Math.min(list.length - 1, v + d)));
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', k);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', k);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!p) return null;
  return (
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      onPointerDown={(e) => {
        x0.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (x0.current === null) return;
        const dx = e.clientX - x0.current;
        x0.current = null;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="v-top">
        <span>{i + 1} / {list.length}{p.at ? ` · ${mdw(p.at.slice(0, 10))} ${p.at.slice(11, 16)}` : ''}</span>
        <button className="icon-btn" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {big || small ? <img src={big ?? small} alt="" draggable={false} /> : <span className="ph-wait">{p.up ? '아직 올라가는 중이에요' : '불러오는 중'}</span>}
      {i > 0 && <button className="v-nav l" onClick={() => go(-1)} aria-label="이전 사진"><Icon name="back" /></button>}
      {i < list.length - 1 && <button className="v-nav r" onClick={() => go(1)} aria-label="다음 사진"><Icon name="chev" /></button>}
    </div>
  );
}

/* ================= 기록 남기기 / 고치기 ================= */
export function MemoSheet({ trip, id, date }: { trip: Trip; id?: string; date?: string }) {
  const { close, toast } = useUI();
  const t = useTrip(trip.id) ?? trip;
  const ses = useSession();
  const m = id ? memosOf(t).find((x) => x.id === id) : undefined;
  const ds = daysOf(t);
  const [day, setDay] = useState(m ? dayOf(t, m.date) : (date ?? defaultDay(t)));
  const [dayTouched, setDayTouched] = useState(!!m || !!date);
  const [text, setText] = useState(m?.text ?? '');
  const [keep, setKeep] = useState<Photo[]>(m?.photos ?? []);
  const [added, setAdded] = useState<Prepared[]>([]);
  const [planId, setPlanId] = useState(m?.planId ?? '');
  const [busy, setBusy] = useState('');
  const items = dayItems(t, day).filter((p) => p.type !== 'flight' || p.title);
  const all = [...keep, ...added.map((a) => a.photo)];

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const fs = [...files].filter((f) => f.type.startsWith('image/'));
    const got: Prepared[] = [];
    for (let i = 0; i < fs.length; i++) {
      setBusy(`사진 준비 중 ${i + 1}/${fs.length}`);
      try {
        got.push(await preparePhoto(fs[i], t.id));
      } catch {}
    }
    setBusy('');
    if (!got.length) return toast('사진을 읽지 못했어요');
    setAdded((a) => [...a, ...got]);
    // 날짜를 직접 안 골랐으면 사진 찍은 날로
    const d = !dayTouched && photoDay(got.map((g) => g.photo), ds);
    if (d) setDay(d);
  }

  function save() {
    if (!text.trim() && !all.length) return toast('사진이나 글 중 하나는 있어야 해요');
    const mid = m?.id ?? uid();
    const removed = m ? m.photos.filter((p) => !keep.some((k) => k.id === p.id)) : [];
    updateTrip(t.id, (x) => {
      x.memo ??= [];
      const rec = { date: day, text: text.trim(), photos: all, planId: planId || null };
      const cur = x.memo.find((y) => y.id === mid);
      if (cur) Object.assign(cur, rec);
      else x.memo.push({ id: mid, by: ses.me ?? 'm', at: new Date().toISOString(), ...rec });
    });
    removePhotos(removed);
    if (added.length) void queuePhotos(t.id, mid, added, toast);
    close();
    toast(m ? '기록을 고쳤어요' : '기록을 남겼어요');
  }

  return (
    <>
      <SheetHead title={m ? '기록 고치기' : '기록 남기기'} />
      <div className="memo-photos">
        {all.map((p) => (
          <div key={p.id} className="mp">
            <Thumb p={p} />
            <button
              type="button"
              className="mp-x"
              aria-label="사진 빼기"
              onClick={() => {
                setKeep((k) => k.filter((x) => x.id !== p.id));
                setAdded((a) => a.filter((x) => x.photo.id !== p.id));
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        <label className={'mp-add' + (busy ? ' busy' : '')}>
          {busy ? <span className="spin" /> : <Icon name="photo" />}
          <span>{busy || (all.length ? '더 넣기' : '사진 넣기')}</span>
          <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }} />
        </label>
      </div>
      <textarea className="inp memo-in" rows={4} placeholder="오늘 어땠어요? 맛있었던 것, 웃겼던 일, 기억하고 싶은 한 줄" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row2">
        <div className="field">
          <label htmlFor="mmDate">날짜</label>
          <select
            className="inp"
            id="mmDate"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setDayTouched(true);
              setPlanId('');
            }}
          >
            {ds.map((d, i) => (
              <option key={d} value={d}>Day {i + 1} · {mdw(d)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="mmPlace">어디서 (선택)</label>
          <select className="inp" id="mmPlace" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">고르지 않음</option>
            {items.map((p) => (
              <option key={p.id} value={p.id}>{p.time} {p.title}</option>
            ))}
          </select>
        </div>
      </div>
      <button className="primary" onClick={save} disabled={!!busy}>{m ? '고치기' : '남기기'}</button>
      {m && (
        <ConfirmButton
          label="기록 삭제"
          onConfirm={() => {
            updateTrip(t.id, (x) => {
              x.memo = (x.memo ?? []).filter((y) => y.id !== m.id);
            });
            removePhotos(m.photos);
            close();
            toast('기록을 지웠어요');
          }}
        />
      )}
    </>
  );
}
