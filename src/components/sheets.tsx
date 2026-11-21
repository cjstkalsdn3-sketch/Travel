'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CatChips, ConfirmButton, Seg, SheetHead, useCopy, useUI } from './ui';
import { CATS, COUNTRY, CUR, MODES } from '@/lib/constants';
import { signOut, update, updateTrip, useData, useSession } from '@/lib/store';
import { starterChecklist } from '@/lib/sample';
import type { Booking, Cat, CountryCode, CurCode, Expense, Mode, PayMethod, Person, PlanItem, Split, Trip, Wish } from '@/lib/types';
import { compressImage, daysOf, digits, fmt, host, iso, krw, mdw, rateLabel, toK, today, uid } from '@/lib/utils';

const comma = (n: number) => (n ? n.toLocaleString('ko-KR') : '');

/* ================= 지출 ================= */
export function ExpenseSheet({ trip, id, onSaved }: { trip: Trip; id?: string; onSaved?: () => void }) {
  const { close, toast } = useUI();
  const data = useData();
  const e = id ? trip.exp.find((x) => x.id === id) : undefined;
  const ds = daysOf(trip);
  const T = today();
  const defDate = ds.includes(T) ? T : T < trip.start ? 'pre' : ds[ds.length - 1];

  const [amt, setAmt] = useState(e ? String(e.amt) : '');
  const [cur, setCur] = useState<CurCode>(e?.cur ?? trip.cur);
  const [cat, setCat] = useState<Cat>(e?.cat ?? 'food');
  const [payer, setPayer] = useState<Person>(e?.payer ?? data.last.payer);
  const [pay, setPay] = useState<PayMethod>(e?.pay ?? data.last.pay);
  const [split, setSplit] = useState<Split>(e?.split ?? 'half');
  const [title, setTitle] = useState(e?.title ?? '');
  const [date, setDate] = useState(e?.date ?? defDate);

  const C = CUR[cur];
  const a = parseFloat(amt || '0');
  const names = data.people;

  function key(k: string) {
    if (k === '⌫') return setAmt((s) => s.slice(0, -1));
    if (k === '.') return C.dec && !amt.includes('.') && setAmt((amt || '0') + '.');
    if (amt.includes('.') && amt.split('.')[1].length >= C.dec) return;
    if (amt.replace('.', '').length >= 10) return;
    setAmt((amt === '0' ? '' : amt) + k);
  }
  function switchCur(c: CurCode) {
    setCur(c);
    if (CUR[c].dec === 0 && amt.includes('.')) setAmt(amt.split('.')[0]);
  }
  function save() {
    if (!a) return;
    const rec: Omit<Expense, 'id'> = { amt: a, cur, cat, payer, pay, split, title: title.trim(), date };
    update((d) => {
      const t = d.trips.find((x) => x.id === trip.id)!;
      if (e) Object.assign(t.exp.find((x) => x.id === e.id)!, rec);
      else t.exp.push({ id: uid(), ...rec });
      d.last = { payer, pay };
    });
    close();
    toast(`${krw(toK(rec, trip))} ${e ? '고쳤어요' : '기록했어요'}`);
    onSaved?.();
  }

  const [i, f] = amt.split('.');
  const shown = amt ? C.sym + Number(i || 0).toLocaleString('ko-KR') + (f !== undefined ? '.' + f : '') : C.sym + '0';
  const curs = Array.from(new Set<CurCode>([trip.cur, 'KRW']));

  return (
    <>
      <SheetHead title={e ? '지출 고치기' : '지출 기록'} />
      <div className="amt-wrap">
        <Seg value={cur} onChange={switchCur} options={curs.map((c) => [c, `${CUR[c].sym} ${CUR[c].name}`])} />
        <div className={'amt' + (a ? '' : ' zero')} aria-live="polite">{shown}</div>
        <div className="conv">{cur === 'KRW' ? (a ? '원화로 결제' : '') : a ? `≈ ${krw(toK({ amt: a, cur }, trip))}` : rateLabel(trip)}</div>
      </div>
      <CatChips value={cat} onChange={setCat} keys={Object.keys(CATS) as Cat[]} />
      <div className="row2">
        <div className="field">
          <span className="lbl">누가 냈어요?</span>
          <Seg full value={payer} onChange={setPayer} options={[['m', names.m.name], ['g', names.g.name]]} />
        </div>
        <div className="field">
          <span className="lbl">어떻게?</span>
          <Seg full value={pay} onChange={setPay} options={[['card', '카드'], ['travel', '트래블'], ['cash', '현금']]} />
        </div>
      </div>
      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
          <button key={k} type="button" onClick={() => key(k)} disabled={k === '.' && C.dec === 0} aria-label={k === '⌫' ? '지우기' : k}>
            {k}
          </button>
        ))}
      </div>
      <details className="more" open={!!e}>
        <summary>
          메모 · 나누는 방법 · 날짜 <span>›</span>
        </summary>
        <div className="inner">
          <input className="inp" placeholder="메모 (예: 이치란 라멘)" value={title} onChange={(ev) => setTitle(ev.target.value)} autoComplete="off" />
          <div className="field">
            <span className="lbl">나누기</span>
            <Seg full value={split} onChange={setSplit} options={[['half', '반반'], ['payer', '낸 사람 부담'], ['other', '상대 몫']]} />
          </div>
          <div className="field">
            <label htmlFor="expDate">언제</label>
            <select className="inp" id="expDate" value={date} onChange={(ev) => setDate(ev.target.value)}>
              {['pre', ...ds].map((d) => (
                <option key={d} value={d}>{d === 'pre' ? '여행 전 (예약·결제)' : mdw(d)}</option>
              ))}
            </select>
          </div>
        </div>
      </details>
      <button className="primary" disabled={!a} onClick={save}>
        {a ? `${C.sym}${a.toLocaleString('ko-KR', { maximumFractionDigits: C.dec })} 기록하기` : '금액을 입력하세요'}
      </button>
      {e && (
        <ConfirmButton
          label="이 지출 삭제"
          onConfirm={() => {
            updateTrip(trip.id, (t) => (t.exp = t.exp.filter((x) => x.id !== e.id)));
            close();
            toast('삭제했어요');
          }}
        />
      )}
    </>
  );
}

/* ================= 일정 ================= */
export function PlanSheet({
  trip,
  id,
  day,
  fromWish,
  onSaved,
}: {
  trip: Trip;
  id?: string;
  day?: string;
  fromWish?: Wish;
  onSaved?: (date: string) => void;
}) {
  const { close, toast } = useUI();
  const p = id ? trip.plan.find((x) => x.id === id) : undefined;
  const ds = daysOf(trip);
  const [title, setTitle] = useState(p?.title ?? fromWish?.title ?? '');
  const [type, setType] = useState<Cat>(p?.type ?? (fromWish && fromWish.type !== 'etc' ? fromWish.type : 'sight'));
  const [date, setDate] = useState(p?.date ?? day ?? ds[0]);
  const [time, setTime] = useState(p?.time ?? '12:00');
  const [mode, setMode] = useState<Mode | ''>(p?.travel?.mode ?? '');
  const [min, setMin] = useState(p?.travel?.min ? String(p.travel.min) : '');
  const [place, setPlace] = useState(p?.place ?? fromWish?.place ?? '');
  const [note, setNote] = useState(p?.note ?? fromWish?.note ?? '');
  const [err, setErr] = useState(false);

  function save() {
    if (!title.trim()) return setErr(true);
    const m = digits(min);
    const rec: Omit<PlanItem, 'id'> = { title: title.trim(), type, date, time: time || '12:00', place: place.trim(), note: note.trim(), travel: mode && m ? { mode, min: m } : null };
    updateTrip(trip.id, (t) => {
      let pid = p?.id;
      if (pid) Object.assign(t.plan.find((x) => x.id === pid)!, rec);
      else {
        pid = uid();
        t.plan.push({ id: pid, ...rec });
      }
      if (fromWish) {
        const w = t.wish.find((x) => x.id === fromWish.id);
        if (w) w.planId = pid;
      }
    });
    close();
    toast(fromWish ? '일정에 넣었어요' : '저장했어요');
    onSaved?.(date);
  }

  return (
    <>
      <SheetHead title={p ? '일정 고치기' : fromWish ? '가볼 곳을 일정에 넣기' : '일정 추가'} />
      <input className="inp" placeholder="무엇을 하나요? (예: 팀랩 플래닛)" value={title} onChange={(e) => (setTitle(e.target.value), setErr(false))} aria-invalid={err} autoComplete="off" autoFocus={!p && !fromWish} />
      {err && <p className="err">무엇을 하는지 적어주세요.</p>}
      <CatChips value={type} onChange={setType} keys={['sight', 'food', 'shop', 'move', 'stay', 'flight', 'etc']} label={(c) => (c === 'sight' ? '구경' : CATS[c])} />
      <div className="row2">
        <div className="field">
          <label htmlFor="plDate">날짜</label>
          <select className="inp" id="plDate" value={date} onChange={(e) => setDate(e.target.value)}>
            {ds.map((d, i) => (
              <option key={d} value={d}>Day {i + 1} · {mdw(d)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="plTime">시간</label>
          <input className="inp" type="time" id="plTime" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="plMode">여기까지 이동</label>
          <select className="inp" id="plMode" value={mode} onChange={(e) => setMode(e.target.value as Mode | '')}>
            <option value="">없음</option>
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <option key={m} value={m}>{MODES[m]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="plMin">걸리는 시간(분)</label>
          <input className="inp num" id="plMin" inputMode="numeric" placeholder="20" value={min} onChange={(e) => setMin(e.target.value.replace(/[^\d]/g, ''))} autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="plPlace">장소 (지도 검색어)</label>
        <input className="inp" id="plPlace" placeholder="예: teamLab Planets TOKYO" value={place} onChange={(e) => setPlace(e.target.value)} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="plNote">메모</label>
        <input className="inp" id="plNote" placeholder="준비할 것, 꼭 할 것" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
      </div>
      <button className="primary" onClick={save}>{p ? '저장' : '추가하기'}</button>
      {p && (
        <ConfirmButton
          label="이 일정 삭제"
          onConfirm={() => {
            updateTrip(trip.id, (t) => {
              t.plan = t.plan.filter((x) => x.id !== p.id);
              t.wish.forEach((w) => w.planId === p.id && (w.planId = null));
            });
            close();
            toast('삭제했어요');
          }}
        />
      )}
    </>
  );
}

/* ================= 가볼 곳 ================= */
export function WishSheet({ trip, id }: { trip: Trip; id?: string }) {
  const { close, toast } = useUI();
  const w = id ? trip.wish.find((x) => x.id === id) : undefined;
  const [url, setUrl] = useState(w?.url ?? '');
  const [title, setTitle] = useState(w?.title ?? '');
  const [type, setType] = useState<Cat>(w?.type ?? 'food');
  const [place, setPlace] = useState(w?.place ?? '');
  const [note, setNote] = useState(w?.note ?? '');
  const [err, setErr] = useState(false);

  function save() {
    const name = title.trim() || (url.trim() && (host(url.trim()) || url.trim()));
    if (!name) return setErr(true);
    const rec = { title: name, type, url: url.trim(), place: place.trim(), note: note.trim() };
    updateTrip(trip.id, (t) => {
      if (w) Object.assign(t.wish.find((x) => x.id === w.id)!, rec);
      else t.wish.unshift({ id: uid(), planId: null, ...rec });
    });
    close();
    toast('가볼 곳에 저장했어요');
  }
  return (
    <>
      <SheetHead title={w ? '가볼 곳 고치기' : '가볼 곳 저장'} />
      <div className="field">
        <label htmlFor="wsUrl">링크 (인스타, 블로그, 유튜브)</label>
        <input className="inp" id="wsUrl" type="url" inputMode="url" placeholder="붙여넣기" value={url} onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
      </div>
      <input className="inp" placeholder="이름 (예: 이치란 라멘 시부야)" value={title} onChange={(e) => (setTitle(e.target.value), setErr(false))} aria-invalid={err} autoComplete="off" />
      {err && <p className="err">이름이나 링크 중 하나는 있어야 해요.</p>}
      <CatChips value={type} onChange={setType} keys={['food', 'sight', 'shop', 'stay', 'etc']} />
      <div className="field">
        <label htmlFor="wsPlace">장소 (지도 검색어)</label>
        <input className="inp" id="wsPlace" placeholder="예: Ichiran Shibuya" value={place} onChange={(e) => setPlace(e.target.value)} autoComplete="off" />
      </div>
      <input className="inp" placeholder="메모 (예: 웨이팅 길어요)" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
      <button className="primary" onClick={save}>저장하기</button>
      {w && (
        <ConfirmButton
          label="삭제"
          onConfirm={() => {
            updateTrip(trip.id, (t) => (t.wish = t.wish.filter((x) => x.id !== w.id)));
            close();
            toast('삭제했어요');
          }}
        />
      )}
    </>
  );
}

/* ================= 예약 ================= */
export function BookingView({ trip, id }: { trip: Trip; id: string }) {
  const { open } = useUI();
  const copy = useCopy();
  const b = trip.book.find((x) => x.id === id);
  if (!b) return null;
  return (
    <>
      <SheetHead title={b.title} />
      <div className="bigcode">
        <small>예약번호</small>
        <b>{b.code || '-'}</b>
      </div>
      {b.code && <button className="primary" onClick={() => copy(b.code)}>예약번호 복사</button>}
      <p className="muted" style={{ margin: 0 }}>
        {b.date ? mdw(b.date) : ''} {b.time}
        {b.detail && <><br />{b.detail}</>}
      </p>
      {b.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="voucher" src={b.img} alt="바우처" />
      ) : (
        <p className="note">바우처 사진이 없어요. 수정에서 캡처나 사진을 붙여두면 입구에서 바로 보여줄 수 있어요.</p>
      )}
      <button className="sec-btn" onClick={() => open(<BookingSheet trip={trip} id={b.id} />)}>수정</button>
    </>
  );
}

export function BookingSheet({ trip, id }: { trip: Trip; id?: string }) {
  const { close, toast } = useUI();
  const b = id ? trip.book.find((x) => x.id === id) : undefined;
  const ds = daysOf(trip);
  const [type, setType] = useState<Cat>(b?.type ?? 'flight');
  const [title, setTitle] = useState(b?.title ?? '');
  const [code, setCode] = useState(b?.code ?? '');
  const [date, setDate] = useState(b?.date ?? '');
  const [time, setTime] = useState(b?.time ?? '');
  const [detail, setDetail] = useState(b?.detail ?? '');
  const [img, setImg] = useState<string | null>(b?.img ?? null);
  const [err, setErr] = useState(false);

  async function onFile(f?: File) {
    if (!f) return;
    try {
      setImg(await compressImage(f));
    } catch {
      toast('이 파일은 열 수 없어요. 사진이나 캡처를 골라주세요.');
    }
  }
  function save() {
    if (!title.trim()) return setErr(true);
    const rec: Omit<Booking, 'id'> = { type, title: title.trim(), code: code.trim().toUpperCase(), date, time, detail: detail.trim(), img };
    const ok = updateTrip(trip.id, (t) => {
      if (b) Object.assign(t.book.find((x) => x.id === b.id)!, rec);
      else t.book.push({ id: uid(), ...rec });
    });
    if (ok) {
      close();
      toast('예약을 보관했어요');
    }
  }
  return (
    <>
      <SheetHead title={b ? '예약 고치기' : '예약 추가'} />
      <CatChips value={type} onChange={setType} keys={['flight', 'stay', 'sight', 'move', 'food', 'etc']} label={(c) => (c === 'sight' ? '입장권' : c === 'food' ? '식당' : CATS[c])} />
      <input className="inp" placeholder="이름 (예: KE703 인천 → 나리타)" value={title} onChange={(e) => (setTitle(e.target.value), setErr(false))} aria-invalid={err} autoComplete="off" />
      {err && <p className="err">이름을 적어주세요.</p>}
      <input className="inp num" placeholder="예약번호" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" style={{ textTransform: 'uppercase', letterSpacing: '.05em' }} />
      <div className="row2">
        <div className="field">
          <label htmlFor="bkDate">날짜</label>
          <select className="inp" id="bkDate" value={date} onChange={(e) => setDate(e.target.value)}>
            <option value="">날짜 없음</option>
            {ds.map((d, i) => (
              <option key={d} value={d}>Day {i + 1} · {mdw(d)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="bkTime">시간</label>
          <input className="inp" type="time" id="bkTime" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <input className="inp" placeholder="메모 (좌석, 체크아웃 시간 등)" value={detail} onChange={(e) => setDetail(e.target.value)} autoComplete="off" />
      {img ? (
        <div className="thumbwrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="voucher" src={img} alt="바우처 미리보기" />
          <button type="button" onClick={() => setImg(null)}>빼기</button>
        </div>
      ) : (
        <label className="dropzone">
          <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} />
          <b>바우처 사진 추가</b>캡처나 사진 (PDF는 다음 단계에서 지원)
        </label>
      )}
      <p className="note">일정과 날짜·시간이 같으면 일정 카드에 예약번호가 같이 보여요.</p>
      <button className="primary" onClick={save}>{b ? '저장' : '추가하기'}</button>
      {b && (
        <ConfirmButton
          label="이 예약 삭제"
          onConfirm={() => {
            updateTrip(trip.id, (t) => (t.book = t.book.filter((x) => x.id !== b.id)));
            close();
            toast('삭제했어요');
          }}
        />
      )}
    </>
  );
}

/* ================= 여행 만들기 / 설정 ================= */
export function TripSheet({ trip }: { trip?: Trip }) {
  const { close, toast } = useUI();
  const router = useRouter();
  const s0 = new Date();
  s0.setDate(s0.getDate() + 30);
  const e0 = new Date(s0);
  e0.setDate(e0.getDate() + 3);
  const [name, setName] = useState(trip?.name ?? '');
  const [start, setStart] = useState(trip?.start ?? iso(s0));
  const [end, setEnd] = useState(trip?.end ?? iso(e0));
  const [country, setCountry] = useState<CountryCode>(trip?.country ?? 'JP');
  const [to, setTo] = useState(trip?.to ?? '');
  const [budget, setBudget] = useState(trip ? comma(trip.budget) : '');
  const [err, setErr] = useState(false);

  function save() {
    if (!name.trim()) return setErr(true);
    let [s, e] = [start, end];
    if (e < s) [s, e] = [e, s];
    const cur = COUNTRY[country].cur;
    const code = to.trim().toUpperCase();
    const rec = { name: name.trim(), start: s, end: e, country, to: code, from: code ? 'ICN' : '', fromName: '인천', budget: digits(budget) || 2000000 };
    if (trip) {
      updateTrip(trip.id, (t) => {
        if (t.cur !== cur) Object.assign(t, { cur, rate: CUR[cur].rate });
        if (t.to !== code) t.toName = '';
        Object.assign(t, rec);
      });
      close();
      toast('저장했어요');
      return;
    }
    const id = uid();
    const nt: Trip = { id, ...rec, toName: '', cur, rate: CUR[cur].rate, cash: 0, weather: null, plan: [], exp: [], book: [], wish: [], check: starterChecklist() };
    update((d) => void d.trips.push(nt));
    close();
    toast('새 여행을 만들었어요');
    router.push(`/trips/${id}`);
  }

  return (
    <>
      <SheetHead title={trip ? '여행 설정' : '새 여행'} />
      <input className="inp" placeholder="여행 이름 (예: 오사카 벚꽃)" value={name} onChange={(e) => (setName(e.target.value), setErr(false))} aria-invalid={err} autoComplete="off" autoFocus={!trip} />
      {err && <p className="err">여행 이름을 적어주세요.</p>}
      <div className="row2">
        <div className="field">
          <label htmlFor="trS">가는 날</label>
          <input className="inp" type="date" id="trS" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="trE">오는 날</label>
          <input className="inp" type="date" id="trE" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="trC">나라</label>
          <select className="inp" id="trC" value={country} onChange={(e) => setCountry(e.target.value as CountryCode)}>
            {(Object.keys(COUNTRY) as CountryCode[]).map((k) => (
              <option key={k} value={k}>{COUNTRY[k].name} ({CUR[COUNTRY[k].cur].name})</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="trTo">도착 공항 코드</label>
          <input className="inp" id="trTo" placeholder="KIX" maxLength={3} value={to} onChange={(e) => setTo(e.target.value)} style={{ textTransform: 'uppercase' }} autoComplete="off" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="trB">총예산 (원)</label>
        <input className="inp num" id="trB" inputMode="numeric" placeholder="2,000,000" value={budget} onChange={(e) => setBudget(comma(digits(e.target.value)))} autoComplete="off" />
      </div>
      {!trip && <p className="note">환율은 다음 단계에서 매일 자동으로 가져와요. 지금은 기본 값이에요.</p>}
      <button className="primary" onClick={save}>{trip ? '저장' : '만들기'}</button>
      {trip && (
        <ConfirmButton
          label="이 여행 통째로 삭제"
          onConfirm={() => {
            router.push('/');
            update((d) => void (d.trips = d.trips.filter((x) => x.id !== trip.id)));
            close();
            toast('여행을 삭제했어요');
          }}
        />
      )}
    </>
  );
}

export function BudgetSheet({ trip }: { trip: Trip }) {
  const { close, toast } = useUI();
  const [v, setV] = useState(comma(trip.budget));
  return (
    <>
      <SheetHead title="총예산" />
      <input className="inp num" inputMode="numeric" value={v} onChange={(e) => setV(comma(digits(e.target.value)))} style={{ fontSize: 22, textAlign: 'center' }} autoComplete="off" aria-label="총예산" />
      <div className="seg full">
        {[100, 200, 300, 500].map((m) => (
          <button key={m} type="button" onClick={() => setV(comma(m * 10000))}>{m}만</button>
        ))}
      </div>
      <button
        className="primary"
        onClick={() => {
          const b = digits(v);
          if (b) updateTrip(trip.id, (t) => (t.budget = b));
          close();
          toast('예산을 바꿨어요');
        }}
      >
        저장
      </button>
    </>
  );
}

export function CashSheet({ trip }: { trip: Trip }) {
  const { close, toast } = useUI();
  const C = CUR[trip.cur];
  const [v, setV] = useState('');
  const n = digits(v);
  return (
    <>
      <SheetHead title="환전 추가" />
      <p className="sub" style={{ margin: 0 }}>지금까지 환전한 현금 {fmt(trip.cash, trip.cur)}</p>
      <div className="field">
        <label htmlFor="cashIn">이번에 바꾼 {C.name}</label>
        <input className="inp num" id="cashIn" inputMode="numeric" placeholder={comma(C.quick[1])} value={v} onChange={(e) => setV(comma(digits(e.target.value)))} style={{ fontSize: 22, textAlign: 'center' }} autoComplete="off" />
      </div>
      <p className="conv" style={{ textAlign: 'center', margin: 0 }}>{n ? `≈ ${krw(n * trip.rate)}` : ''}</p>
      <div className="seg full">
        {C.quick.map((q) => (
          <button key={q} type="button" onClick={() => setV(comma(q))}>{fmt(q, trip.cur)}</button>
        ))}
      </div>
      <button
        className="primary"
        disabled={!n}
        onClick={() => {
          updateTrip(trip.id, (t) => (t.cash += n));
          close();
          toast(`${fmt(n, trip.cur)} 환전 기록했어요`);
        }}
      >
        더하기
      </button>
      {trip.cash > 0 && (
        <ConfirmButton
          label="환전 기록 0으로"
          confirm="한 번 더 누르면 0이 돼요"
          onConfirm={() => {
            updateTrip(trip.id, (t) => (t.cash = 0));
            close();
          }}
        />
      )}
    </>
  );
}

export function PeopleSheet() {
  const { close, toast } = useUI();
  const d = useData();
  const s = useSession();
  const [m, setM] = useState(d.people.m.name);
  const [g, setG] = useState(d.people.g.name);
  return (
    <>
      <SheetHead title="우리 두 사람" />
      <div className="field">
        <label htmlFor="pm">첫 번째 사람</label>
        <input className="inp" id="pm" value={m} onChange={(e) => setM(e.target.value)} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="pg">두 번째 사람</label>
        <input className="inp" id="pg" value={g} onChange={(e) => setG(e.target.value)} autoComplete="off" />
      </div>
      <p className="note">정산, 지출, 준비물 담당자에 이 이름이 쓰여요.</p>
      <button
        className="primary"
        onClick={() => {
          update((x) => {
            x.people.m.name = m.trim() || '민우';
            x.people.g.name = g.trim() || '여자친구';
          });
          close();
          toast('이름을 바꿨어요');
        }}
      >
        저장
      </button>
      {s.status === 'ready' && (
        <>
          <p className="note" style={{ margin: 0 }}>{s.email} 로 로그인됨{s.inviteCode ? ` · 초대 코드 ${s.inviteCode}` : ''}</p>
          <ConfirmButton label="로그아웃" confirm="한 번 더 누르면 로그아웃돼요" onConfirm={() => (close(), void signOut())} />
        </>
      )}
    </>
  );
}

