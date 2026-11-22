'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { CatChips, ccStyle, ConfirmButton, Seg, SheetHead, useCopy, useUI } from './ui';
import { PlaceField } from './maps';
import { NearbySheet } from './Nearby';
import { isMapsUrl, mapsEnabled, resolveLink } from '@/lib/maps';
import { DEFAULT_STAY, isFixed, ordForInsert, unplaced, unplan } from '@/lib/plan';
import { kindToCat } from '@/lib/importer';
import { AIRPORTS, CATS, COUNTRY, CUR, EXP_CATS, KR_AIRPORTS, MODES, airportName } from '@/lib/constants';
import { liveRate } from '@/lib/fx';
import { signOut, update, updateTrip, useData, useSession } from '@/lib/store';
import { starterChecklist } from '@/lib/sample';
import type { Booking, Cat, CountryCode, CurCode, Expense, Geo, Mode, PayMethod, Payer, PlanItem, Split, Stop, Trip, Wish } from '@/lib/types';
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
  const [payer, setPayer] = useState<Payer>(e?.payer ?? data.last.payer);
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
    const rec: Omit<Expense, 'id'> = { amt: a, cur, cat, payer, pay, split: payer === 'common' ? 'half' : split, title: title.trim(), date };
    // 기록할 때의 환율을 함께 저장 (나중에 환율이 바뀌어도 이미 쓴 돈은 그대로)
    if (cur !== 'KRW') rec.rate = e && e.cur === cur && e.rate ? e.rate : cur === trip.cur ? trip.rate : CUR[cur].rate;
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
      <CatChips value={cat} onChange={setCat} keys={EXP_CATS} />
      <div className="pay-rows">
        <div className="field">
          <span className="lbl">누가 냈어요?</span>
          <Seg full value={payer} onChange={setPayer} options={[['m', names.m.name], ['g', names.g.name], ['common', '공용']]} />
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
          {payer === 'common' ? (
            <p className="note" style={{ margin: 0 }}>공용 지갑에서 낸 돈은 정산에 안 들어가요.</p>
          ) : (
            <div className="field">
              <span className="lbl">나누기</span>
              <Seg full value={split} onChange={setSplit} options={[['half', '반반'], ['payer', '낸 사람 부담'], ['other', '상대 몫']]} />
            </div>
          )}
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

/* ================= 일정 안에 함께 들르는 곳 ================= */
function StopsField({ trip, planId, exclude, stops, onChange }: { trip: Trip; planId?: string; exclude?: string; stops: Stop[]; onChange: (s: Stop[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [n, setN] = useState(0);
  const used = new Set(stops.map((x) => x.wishId));
  // 담아둔 장소 (아직 다른 일정에 안 넣은 곳 + 이 일정에 이미 연결된 곳은 제외)
  const waiting = unplaced(trip).filter((w) => w.id !== exclude && !used.has(w.id) && w.planId !== planId);
  const add = (x: Stop) => onChange([...stops, x]);
  const move = (i: number, d: number) => {
    const a = [...stops];
    const j = i + d;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };
  return (
    <div className="field stops">
      <span className="lbl">함께 들를 곳 {stops.length > 0 && <b className="cnt">{stops.length}</b>}</span>
      {stops.length > 0 && (
        <ol className="stop-list">
          {stops.map((x, i) => (
            <li key={x.id} style={ccStyle(x.type ?? 'sight')}>
              <span className="stop-n">{i + 1}</span>
              <span className="stop-t">
                <b>{x.name}</b>
                {x.geo?.addr && <small>{x.geo.addr}</small>}
              </span>
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로"><Icon name="back" size={14} /></button>
              <button type="button" onClick={() => onChange(stops.filter((y) => y.id !== x.id))} aria-label="빼기"><Icon name="x" size={14} /></button>
            </li>
          ))}
        </ol>
      )}
      {waiting.length > 0 && (
        <div className="stop-pick">
          <small>담아둔 곳에서 톡 눌러 넣기</small>
          <div className="stop-chips">
            {waiting.map((w) => (
              <button key={w.id} type="button" className="tchip" style={ccStyle(w.type)} onClick={() => add({ id: uid(), name: w.title, geo: w.geo ?? null, type: w.type, wishId: w.id })}>
                <span className="cat-ic"><Icon name={w.type} /></span>
                <span className="tchip-t">{w.title}</span>
                <Icon name="plus" size={13} />
              </button>
            ))}
          </div>
        </div>
      )}
      {adding ? (
        <PlaceField
          key={n}
          trip={trip}
          id="plStop"
          label="장소 검색"
          value=""
          geo={null}
          onChange={(pl, g, hit) => {
            if (!hit || !g) return;
            add({ id: uid(), name: hit.name || pl, geo: g, type: kindToCat(hit.kind) });
            setN((k) => k + 1);
          }}
        />
      ) : (
        <button type="button" className="add-stop" onClick={() => setAdding(true)}>+ 장소 검색해서 더 넣기</button>
      )}
    </div>
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
  const { close, toast, open } = useUI();
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
  const [geo, setGeo] = useState<Geo | null>(p?.geo ?? fromWish?.geo ?? null);
  const [stay, setStay] = useState(p?.stay !== undefined ? String(p.stay) : '');
  const [stops, setStops] = useState<Stop[]>(p?.stops ?? []);
  const autoFixed = p ? isFixed({ ...trip, plan: trip.plan }, { ...p, type, fixed: undefined }) : type === 'flight' || type === 'stay';
  const [fixed, setFixed] = useState<boolean | undefined>(p?.fixed);
  const [err, setErr] = useState(false);

  function save() {
    if (!title.trim()) return setErr(true);
    const m = digits(min);
    const prevTravel = p?.travel;
    const travel = mode && m ? { mode, min: m, ...(prevTravel?.auto && prevTravel.mode === mode && prevTravel.min === m ? { auto: true } : {}) } : null;
    const rec: Omit<PlanItem, 'id'> = { title: title.trim(), type, date, time: time || '12:00', place: place.trim(), note: note.trim(), travel, geo };
    if (stay !== '') rec.stay = digits(stay);
    if (fixed !== undefined) rec.fixed = fixed;
    if (stops.length) rec.stops = stops;
    updateTrip(trip.id, (t) => {
      let pid = p?.id;
      const moved = !p || p.date !== date || p.time !== rec.time;
      const ord = moved ? ordForInsert(t, date, rec.time, pid) : p?.ord;
      if (pid) {
        const it = t.plan.find((x) => x.id === pid)!;
        const geoChanged = JSON.stringify(it.geo ?? null) !== JSON.stringify(rec.geo ?? null);
        Object.assign(it, rec);
        // 시간이나 장소가 바뀌면 날씨를 다시 받아옴
        if (moved || geoChanged) delete it.wx;
        if (stay === '') delete it.stay;
        if (!stops.length) delete it.stops;
        if (fixed === undefined) delete it.fixed;
        if (ord === undefined) delete it.ord;
        else it.ord = ord;
      } else {
        pid = uid();
        t.plan.push({ id: pid, ...rec, ...(ord !== undefined ? { ord } : {}) });
      }
      if (fromWish) {
        const w = t.wish.find((x) => x.id === fromWish.id);
        if (w) w.planId = pid;
      }
      // 함께 들르는 곳으로 고른 담아둔 장소는 이 일정에 넣은 걸로, 뺀 건 다시 담아둔 곳으로
      const keep = new Set(stops.map((x) => x.wishId).filter(Boolean));
      for (const x of p?.stops ?? []) if (x.wishId && !keep.has(x.wishId)) {
        const w = t.wish.find((y) => y.id === x.wishId);
        if (w && w.planId === pid) w.planId = null;
      }
      for (const id of keep) {
        const w = t.wish.find((y) => y.id === id);
        if (w) w.planId = pid!;
      }
    });
    close();
    toast(fromWish ? '일정에 넣었어요' : '저장했어요');
    onSaved?.(date);
  }

  return (
    <>
      <SheetHead title={p ? '일정 고치기' : fromWish ? '가볼 곳을 일정에 넣기' : '일정 추가'} />
      {p?.geo && mapsEnabled && (
        <button className="near-row" onClick={() => open(<NearbySheet trip={trip} planId={p.id} />)}>
          <Icon name="spark" />
          <span><b>근처 맛집·구경거리 추천</b><small>평점 좋은 곳을 골라 바로 다음 일정으로 넣어요</small></span>
          <Icon name="chev" />
        </button>
      )}
      <input className="inp" placeholder="무엇을 하나요? (예: 팀랩 플래닛)" value={title} onChange={(e) => (setTitle(e.target.value), setErr(false))} aria-invalid={err} autoComplete="off" autoFocus={!p && !fromWish} />
      {err && <p className="err">무엇을 하는지 적어주세요.</p>}
      <CatChips value={type} onChange={setType} keys={['sight', 'food', 'shop', 'station', 'bus', 'move', 'stay', 'flight', 'etc']} label={(c) => (c === 'sight' ? '구경' : c === 'food' ? '음식집' : CATS[c])} />
      <PlaceField
        trip={trip}
        id="plPlace"
        hint={type}
        value={place}
        geo={geo}
        onChange={(pl, g, hit) => {
          setPlace(pl);
          setGeo(g);
          if (hit && !title.trim()) setTitle(hit.name);
        }}
      />
      <StopsField trip={trip} planId={p?.id} exclude={fromWish?.id} stops={stops} onChange={setStops} />
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
      <div className="row2">
        <div className="field">
          <label htmlFor="plStay">머무는 시간(분)</label>
          <input className="inp num" id="plStay" inputMode="numeric" placeholder={String(DEFAULT_STAY[type])} value={stay} onChange={(e) => setStay(e.target.value.replace(/[^\d]/g, ''))} autoComplete="off" />
        </div>
        <div className="field">
          <span className="lbl">동선 정리 때</span>
          <Seg full value={(fixed ?? autoFixed) ? 'fix' : 'free'} onChange={(v) => setFixed(v === 'fix')} options={[['free', '옮겨도 됨'], ['fix', '고정']]} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="plNote">메모</label>
        <input className="inp" id="plNote" placeholder="준비할 것, 꼭 할 것" value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
      </div>
      <button className="primary" onClick={save}>{p ? '저장' : '추가하기'}</button>
      {p && p.type !== 'flight' && (
        <button
          className="ghost-btn"
          onClick={() => {
            updateTrip(trip.id, (t) => unplan(t, p.id));
            close();
            toast('일정에서 빼서 담아뒀어요');
          }}
        >
          일정에서 빼서 담아두기
        </button>
      )}
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
  const [geo, setGeo] = useState<Geo | null>(w?.geo ?? null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [err, setErr] = useState(false);
  // 링크로 장소를 받았을 때만 장소 칸을 새로 그림 (장소 칸에 타이핑할 때 다시 그리면 글자가 날아감)
  const [linkN, setLinkN] = useState(0);

  function onUrl(v: string) {
    setUrl(v);
    if (!mapsEnabled || !isMapsUrl(v)) return;
    setLinkBusy(true);
    resolveLink(v)
      .then((h) => {
        if (!h) return;
        setPlace(h.name);
        setGeo({ lat: h.lat, lng: h.lng, placeId: h.placeId, addr: h.addr });
        setLinkN((n) => n + 1);
        setTitle((t) => t || h.name);
      })
      .catch(() => {})
      .finally(() => setLinkBusy(false));
  }

  function save() {
    const name = title.trim() || (url.trim() && (host(url.trim()) || url.trim()));
    if (!name) return setErr(true);
    const rec = { title: name, type, url: url.trim(), place: place.trim(), note: note.trim(), geo };
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
        <label htmlFor="wsUrl">링크 (구글지도, 인스타, 블로그)</label>
        <div className="place-in">
          <input className="inp" id="wsUrl" type="url" inputMode="url" placeholder="붙여넣기" value={url} onChange={(e) => onUrl(e.target.value)} autoComplete="off" />
          {linkBusy && <span className="spin" aria-label="장소 찾는 중" />}
        </div>
      </div>
      <input className="inp" placeholder="이름 (예: 이치란 라멘 시부야)" value={title} onChange={(e) => (setTitle(e.target.value), setErr(false))} aria-invalid={err} autoComplete="off" />
      {err && <p className="err">이름이나 링크 중 하나는 있어야 해요.</p>}
      <CatChips value={type} onChange={setType} keys={['food', 'sight', 'shop', 'station', 'bus', 'flight', 'stay', 'etc']} label={(c) => (c === 'food' ? '음식집' : CATS[c])} />
      <PlaceField
        trip={trip}
        id="wsPlace"
        hint={type}
        value={place}
        geo={geo}
        key={linkN}
        onChange={(pl, g, hit) => {
          setPlace(pl);
          setGeo(g);
          if (hit && !title.trim()) setTitle(hit.name);
        }}
      />
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
/** 공항 고르기. 목록에 없으면 '직접 입력' */
function AirportPick({ id, label, list, value, onChange }: { id: string; label: string; list: [string, string][]; value: string; onChange: (v: string) => void }) {
  const known = !value || list.some(([c]) => c === value);
  const [own, setOwn] = useState(!known);
  return (
    <div className="field ap">
      <label htmlFor={id}>{label}</label>
      {own ? (
        <input className="inp" id={id} placeholder="코드 3자리" maxLength={3} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} onBlur={() => !value && setOwn(false)} style={{ textTransform: 'uppercase' }} autoComplete="off" autoFocus />
      ) : (
        <select className="inp" id={id} value={value} onChange={(e) => (e.target.value === '*' ? (setOwn(true), onChange('')) : onChange(e.target.value))}>
          {!value && <option value="">고르기</option>}
          {list.map(([c, n]) => (
            <option key={c} value={c}>{n} {c}</option>
          ))}
          <option value="*">직접 입력…</option>
        </select>
      )}
    </div>
  );
}

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
  const [from, setFrom] = useState(trip?.from || 'ICN');
  const [to, setTo] = useState(trip?.to ?? '');
  const [back, setBack] = useState(trip?.back || trip?.to || '');
  const [home, setHome] = useState(trip?.home || trip?.from || 'ICN');
  const [backSame, setBackSame] = useState(!trip?.back || trip.back === trip.to);
  const [homeSame, setHomeSame] = useState(!trip?.home || trip.home === trip.from);
  const [budget, setBudget] = useState(trip ? comma(trip.budget) : '');
  const [err, setErr] = useState(false);

  function save() {
    if (!name.trim()) return setErr(true);
    let [s, e] = [start, end];
    if (e < s) [s, e] = [e, s];
    const cur = COUNTRY[country].cur;
    const code = to.trim().toUpperCase();
    const f = from.trim().toUpperCase() || 'ICN';
    const bk = backSame ? code : back.trim().toUpperCase();
    const hm = homeSame ? f : home.trim().toUpperCase();
    const rec = {
      name: name.trim(), start: s, end: e, country, to: code, from: code ? f : '', fromName: airportName(f) || f,
      back: bk && bk !== code ? bk : undefined, home: hm && hm !== f ? hm : undefined, budget: digits(budget) || 2000000,
    };
    if (trip) {
      updateTrip(trip.id, (t) => {
        if (t.cur !== cur) {
          Object.assign(t, { cur, rate: CUR[cur].rate });
          delete t.rateAt;
        }
        Object.assign(t, rec, { toName: airportName(code) });
        if (!rec.back) delete t.back;
        if (!rec.home) delete t.home;
      });
      close();
      toast('저장했어요');
      return;
    }
    const id = uid();
    const nt: Trip = { id, ...rec, toName: airportName(code), cur, rate: CUR[cur].rate, cash: 0, weather: null, plan: [], exp: [], book: [], wish: [], check: starterChecklist() };
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
      <div className="field">
        <label htmlFor="trC">나라</label>
        <select className="inp" id="trC" value={country} onChange={(e) => setCountry(e.target.value as CountryCode)}>
          {(Object.keys(COUNTRY) as CountryCode[]).map((k) => (
            <option key={k} value={k}>{COUNTRY[k].name} ({CUR[COUNTRY[k].cur].name})</option>
          ))}
        </select>
      </div>
      <div className="flights">
        <div className="fl-row">
          <span className="fl-lbl"><Icon name="flight" />가는 편</span>
          <AirportPick id="apF" label="출발" list={KR_AIRPORTS} value={from} onChange={setFrom} />
          <span className="fl-arrow">→</span>
          <AirportPick id="apT" label="도착" list={AIRPORTS[country]} value={to} onChange={(v) => setTo(v)} />
        </div>
        <div className="fl-row">
          <span className="fl-lbl"><Icon name="flight" className="ret" />오는 편</span>
          <AirportPick id="apB" label="출발" list={AIRPORTS[country]} value={backSame ? to : back} onChange={(v) => { setBack(v); setBackSame(v === to); }} />
          <span className="fl-arrow">→</span>
          <AirportPick id="apH" label="도착" list={KR_AIRPORTS} value={homeSame ? from : home} onChange={(v) => { setHome(v); setHomeSame(v === from); }} />
        </div>
        <p className="note">갈 때와 올 때 공항이 다르면 오는 편만 바꾸세요. 같으면 자동으로 따라가요.</p>
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

export function RateSheet({ trip }: { trip: Trip }) {
  const { close, toast } = useUI();
  const C = CUR[trip.cur];
  const [auto, setAuto] = useState(trip.rateAuto !== false);
  const [v, setV] = useState(String(Math.round(trip.rate * C.unit * 100) / 100));
  const [live, setLive] = useState<number | null>(null);
  useEffect(() => {
    liveRate(trip.cur).then(setLive);
  }, [trip.cur]);
  const n = parseFloat(v.replace(/,/g, ''));
  return (
    <>
      <SheetHead title="환율" />
      <Seg full value={auto ? 'auto' : 'manual'} onChange={(x) => setAuto(x === 'auto')} options={[['auto', '실시간 자동'], ['manual', '직접 입력']]} />
      {auto ? (
        <p className="sub" style={{ margin: 0 }}>
          {live ? `지금 ${C.unit.toLocaleString('ko-KR')}${C.name} = ${Math.round(live * C.unit).toLocaleString('ko-KR')}원이에요. ` : '실시간 환율을 불러오고 있어요. '}
          6시간마다 새로 받아와요. 이미 기록한 지출은 그때 환율 그대로예요.
        </p>
      ) : (
        <div className="field">
          <label htmlFor="rateIn">{C.unit.toLocaleString('ko-KR')}{C.name}에 몇 원? (환전소에서 받은 환율 등)</label>
          <input className="inp num" id="rateIn" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ''))} style={{ fontSize: 22, textAlign: 'center' }} autoComplete="off" />
        </div>
      )}
      <button
        className="primary"
        disabled={!auto && !(n > 0)}
        onClick={() => {
          updateTrip(trip.id, (t) => {
            if (auto) {
              delete t.rateAuto;
              if (live) {
                t.rate = live;
                t.rateAt = new Date().toISOString();
              } else delete t.rateAt;
            } else {
              t.rateAuto = false;
              t.rate = n / C.unit;
            }
          });
          close();
          toast('환율을 바꿨어요');
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

