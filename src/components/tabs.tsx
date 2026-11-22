'use client';

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { ccStyle, Seg, useCopy, useUI, useWide } from './ui';
import { BookingSheet, BookingView, BudgetSheet, CashSheet, RateSheet, ExpenseSheet, PlanSheet, WishSheet } from './sheets';
import { useCurrentTrip } from './TripShell';
import { WxBadge, WxDayPill } from './Wx';
import { DayMap, ImportSheet, ReorderSheet, RouteSheet } from './maps';
import { AltBar } from './Alts';
import { NearbySheet } from './Nearby';
import { PlaceSheet, snapshot, Tray, useDragBoard, type DragSrc, type Over } from './Tray';
import { dayItems, movePlan, placeWish, unplaced, unplan } from '@/lib/plan';
import { mapsEnabled } from '@/lib/maps';
import { CATS, CONSULATE_CALL, COUNTRY, MODES, PAYS, WD } from '@/lib/constants';
import { updateTrip, useData } from '@/lib/store';
import type { Cat, Geo, PayMethod, Who } from '@/lib/types';
import { daysOf, dday, dur, fmt, host, krw, localTime, mapUrl, mdw, mins, pd, rateLabel, toK, today, totals, uid, ago } from '@/lib/utils';

/** 위치가 있으면 그 장소로, 없으면 이름 검색으로 */
const placeUrl = (q: string, g?: Geo | null) =>
  g ? `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lng}${g.placeId ? '&query_place_id=' + encodeURIComponent(g.placeId) : ''}` : mapUrl(q);

const MODE_ICON: Record<string, string> = { subway: 'move', walk: 'walk', bus: 'move', train: 'move', taxi: 'taxi' };

/* ================= 일정 ================= */
export function PlanTab() {
  const t = useCurrentTrip();
  const { open, toast } = useUI();
  const ds = daysOf(t);
  const [day, setDay] = useState(() => Math.max(0, ds.indexOf(today())));
  const i = Math.min(day, ds.length - 1);
  const date = ds[i];
  const items = dayItems(t, date);
  const [showMap, setShowMap] = useState(false);
  const wide = useWide();
  const bigMap = wide && mapsEnabled;
  const [sel, setSel] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [hotWish, setHotWish] = useState<string | null>(null);
  const waiting = unplaced(t);
  const pickWish = (id: string) => open(<PlaceSheet trip={t} id={id} date={date} />);
  const focus = sel && items.some((p) => p.id === sel) ? sel : null;
  const dayK = t.exp.filter((e) => e.date === date).reduce((s, e) => s + toK(e, t), 0);
  const wx = t.wxd?.[date];
  const far = !wx && pd(date).getTime() - pd(today()).getTime() > 15 * 864e5;
  const goTo = (d: string) => setDay(Math.max(0, ds.indexOf(d)));
  // 넓은 화면: 처음 누르면 지도에서 보여주고, 한 번 더 누르면 자세히
  function tapEv(id: string) {
    if (bigMap && focus !== id) return setSel(id);
    open(<PlanSheet trip={t} id={id} onSaved={goTo} />);
  }
  function pickOnMap(id: string) {
    setSel(id);
    document.querySelector(`li.ev[data-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function onDrop(src: DragSrc, over: Over) {
    if (!over) return;
    const undo = snapshot(t);
    const undoAct = { label: '되돌리기', run: undo };
    if (over.zone === 'tray') {
      if (src.kind !== 'plan') return;
      updateTrip(t.id, (x) => unplan(x, src.id));
      return toast('일정에서 빼서 담아뒀어요', undoAct);
    }
    let time = '';
    if (src.kind === 'wish') {
      updateTrip(t.id, (x) => void (time = placeWish(x, src.id, date, over.idx)?.time ?? ''));
      toast(`Day ${i + 1} ${time}에 넣었어요`, undoAct);
    } else {
      updateTrip(t.id, (x) => movePlan(x, src.id, date, over.idx));
      toast('옮겼어요', undoAct);
    }
  }
  const { drag, over, press, layer } = useDragBoard({ onDrop, onDayHover: goTo });

  return (
    <div className={'plan' + (bigMap ? ' wide' : '')}>
      <div className="plan-col">
      <AltBar trip={t} />
      <div className="days" role="tablist" aria-label="날짜">
        {ds.map((d, k) => {
          const x = pd(d);
          return (
            <button key={d} data-date={d} role="tab" aria-selected={k === i} className={'day' + (k === i ? ' on' : '') + (d === today() ? ' today' : '')} onClick={() => { setDay(k); setSel(null); }}>
              <small>DAY {k + 1}</small><b>{x.getDate()}</b><small>{WD[x.getDay()]}</small>
            </button>
          );
        })}
      </div>
      <div className="dayhead">
        <div>
          <h2>Day {i + 1} · {mdw(date)}</h2>
          <p className="ds">{items.length}개 일정{dayK ? ' · 이날 지출 ' + krw(dayK) : ''}</p>
        </div>
        <WxDayPill w={wx} far={far} />
      </div>
      {(items.length > 0 || (mapsEnabled && waiting.some((w) => w.geo))) && (
        <div className="day-acts">
          {mapsEnabled && !bigMap && (
            <button className={'chip-btn' + (showMap ? ' on' : '')} aria-pressed={showMap} onClick={() => setShowMap(!showMap)}>
              <Icon name="map" />지도
            </button>
          )}
          {mapsEnabled && items.length > 1 && (
            <button className="chip-btn" onClick={() => open(<RouteSheet trip={t} date={date} />)}>
              <Icon name="walk" />동선 정리
            </button>
          )}
          {items.length > 1 && (
            <button className="chip-btn" onClick={() => open(<ReorderSheet trip={t} date={date} />)}>
              <Icon name="list" />순서 바꾸기
            </button>
          )}
        </div>
      )}
      {showMap && mapsEnabled && !bigMap && <DayMap items={items} wishes={waiting} onPickWish={pickWish} />}
      {items.length ? (
        <ol className={'tl' + (drag ? ' is-drag' : '')} data-drop="tl">
          {items.map((p, k) => {
            let leg = null;
            if (k > 0) {
              const gap = mins(p.time) - mins(items[k - 1].time);
              const tm = p.travel?.min ?? 0;
              const stay = gap - tm;
              const warn =
                gap < 0 ? <span className="w bad">시간이 앞 일정보다 빨라요</span>
                : stay < 0 ? <span className="w bad">시간 간격보다 이동이 {dur(-stay)} 더 걸려요</span>
                : tm && stay < 30 ? <span className="w">앞 일정에 {stay}분만 머물러요</span>
                : null;
              if (tm || warn)
                leg = (
                  <li className="leg" aria-label="이동">
                    <span /><span className="lgdot" />
                    <span className="lg">
                      {tm ? <><Icon name={MODE_ICON[p.travel!.mode]} />{MODES[p.travel!.mode]} {dur(tm)}</> : null}
                      {warn}
                    </span>
                  </li>
                );
            }
            const bk = t.book.find((b) => b.date === p.date && b.time === p.time);
            return (
              <FragmentLi key={p.id} leg={leg}>
                <li
                  className={'ev' + (drag?.id === p.id ? ' lifted' : '') + (focus === p.id ? ' sel' : '')}
                  data-id={p.id}
                  style={ccStyle(p.type)}
                  {...press({ kind: 'plan', id: p.id, title: p.title, type: p.type })}
                  onClick={() => tapEv(p.id)}
                  onMouseEnter={bigMap ? () => setHot(p.id) : undefined}
                  onMouseLeave={bigMap ? () => setHot(null) : undefined}
                >
                  <time>{p.time}</time>
                  <span className="dot"><Icon name={p.type} /></span>
                  <div className="ev-card">
                    {p.wx && <WxBadge w={p.wx} />}
                    <b>{p.title}</b>
                    {p.note && <p>{p.note}</p>}
                    {focus === p.id && <span className="ev-more">한 번 더 누르면 자세히 <Icon name="chev" /></span>}
                    {(p.place || bk || p.geo) && (
                      <div className="ev-meta" onClick={(e) => e.stopPropagation()}>
                        {bk && (
                          <button className="bkchip" onClick={() => open(<BookingView trip={t} id={bk.id} />)}>
                            <Icon name="ticket" />예약 <code>{bk.code}</code>
                          </button>
                        )}
                        {p.geo && mapsEnabled && (
                          <button className="maplink near" onClick={() => open(<NearbySheet trip={t} planId={p.id} />)}>
                            <Icon name="spark" />주변
                          </button>
                        )}
                        {p.place && (
                          <a className="maplink" target="_blank" rel="noopener noreferrer" href={placeUrl(p.place, p.geo)}>
                            <Icon name="map" />지도
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              </FragmentLi>
            );
          })}
        </ol>
      ) : (
        <div className={'empty' + (over?.zone === 'tl' ? ' hot' : '')} data-drop="tl"><b>아직 일정이 없어요</b>아래 담아둔 장소를 꾹 눌러 여기로 끌어오거나 직접 추가해보세요.</div>
      )}
      <button className="add-row" onClick={() => open(<PlanSheet trip={t} day={date} onSaved={goTo} />)}>+ 이날 일정 추가</button>
      <Tray trip={t} date={date} dragging={drag} overTray={over?.zone === 'tray'} press={press} onHover={bigMap ? setHotWish : undefined} />
      </div>
      {bigMap && (
        <aside className="plan-map" key={date}>
          <DayMap items={items} big focus={focus} hot={hot} onPick={pickOnMap} wishes={waiting} hotWish={hotWish} onPickWish={pickWish} />
          {focus && items.find((x) => x.id === focus)?.geo && (
            <button className="map-all" onClick={() => setSel(null)}>
              <Icon name="map" />하루 전체 보기
            </button>
          )}
        </aside>
      )}
      {layer}
    </div>
  );
}
function FragmentLi({ leg, children }: { leg: React.ReactNode; children: React.ReactNode }) {
  return <>{leg}{children}</>;
}

/* ================= 가볼 곳 ================= */
export function WishTab() {
  const t = useCurrentTrip();
  const { open } = useUI();
  const [f, setF] = useState<'all' | 'todo' | 'in'>('all');
  const ds = daysOf(t);
  const planOf = (id: string | null) => (id ? t.plan.find((p) => p.id === id) : undefined);
  const list = t.wish.filter((w) => f === 'all' || (f === 'in' ? !!planOf(w.planId) : !planOf(w.planId)));
  const inCnt = t.wish.filter((w) => planOf(w.planId)).length;
  return (
    <>
      <div className="wish-head">
      <div className="wishtop">
        <div>
          <h2 className="h2">가고 싶은 곳 {t.wish.length}곳</h2>
          <p className="ds">{inCnt}곳은 일정에 넣었어요</p>
        </div>
        <button className="pill-btn" onClick={() => open(<WishSheet trip={t} />)}>+ 장소</button>
      </div>
      <button className="import-row" onClick={() => open(<ImportSheet trip={t} />)}>
        <Icon name="map" />
        <span><b>구글지도에서 가져오기</b><small>구글지도에서 목록을 공유하면 한 번에 들어와요</small></span>
        <Icon name="chev" />
      </button>
      </div>
      <Seg full value={f} onChange={setF} options={[['all', '전체'], ['todo', '아직'], ['in', '일정에 넣음']]} />
      {list.length ? (
        <div className="list wish-list">
          {list.map((w) => {
            const p = planOf(w.planId);
            return (
              <div className="wish" key={w.id} style={ccStyle(w.type)}>
                <span className="cat-ic"><Icon name={w.type} /></span>
                <div className="t">
                  <b>{w.title}</b>
                  {w.note && <p>{w.note}</p>}
                  <div className="acts">
                    {p ? (
                      <span className="pill good">Day {ds.indexOf(p.date) + 1} · {p.time}</span>
                    ) : (
                      <button className="toplan" onClick={() => open(<PlanSheet trip={t} fromWish={w} />)}>일정에 넣기</button>
                    )}
                    {w.url && (
                      <a className="srclink" target="_blank" rel="noopener noreferrer" href={w.url}><Icon name="link" />{host(w.url) || '링크'}</a>
                    )}
                    {w.place && (
                      <a className="maplink" target="_blank" rel="noopener noreferrer" href={placeUrl(w.place, w.geo)}><Icon name="map" />지도</a>
                    )}
                    <button className="edit-s" onClick={() => open(<WishSheet trip={t} id={w.id} />)}>수정</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <b>{f === 'all' ? '아직 저장한 곳이 없어요' : '여기에 해당하는 곳이 없어요'}</b>
          인스타나 블로그에서 본 곳의 링크를 붙여넣어 저장해보세요.
        </div>
      )}
    </>
  );
}

/* ================= 예산 ================= */
export function MoneyTab() {
  const t = useCurrentTrip();
  const { people } = useData();
  const { open } = useUI();
  const T = totals(t);
  const rem = t.budget - T.spent;
  const ds = daysOf(t);
  const dd = dday(t);
  const cats = Object.entries(T.byCat).sort((a, b) => b[1] - a[1]) as [Cat, number][];
  const perDay = (t.budget - T.pre) / ds.length;
  const left = ds.filter((d) => d >= today()).length;
  const b = T.bal;
  const from = b > 0 ? 'g' : 'm';
  const to = b > 0 ? 'm' : 'g';
  const cashLeft = t.cash - T.cashLocal;
  const groups = ['pre', ...ds].map((d) => [d, t.exp.filter((e) => e.date === d)] as const).filter(([, es]) => es.length);

  return (
    <div className="pg">
      <div className="pg-a">
      <section className="card">
        <p className="big-label">{rem >= 0 ? '남은 예산' : '예산 초과'}</p>
        <p className={'big' + (rem < 0 ? ' over' : '')}>{krw(Math.abs(rem))}</p>
        {t.cur !== 'KRW' && rem > 0 && <p className="big-sub num">≈ {fmt(Math.floor(rem / t.rate), t.cur)} <span>지금 환율로</span></p>}
        <p className="sub">
          총예산 {krw(t.budget)} 중 {krw(T.spent)} 사용 · <button className="link-btn" onClick={() => open(<BudgetSheet trip={t} />)}>예산 바꾸기</button>
        </p>
        <div className="bar">
          {cats.map(([c, v]) => (
            <i key={c} style={{ ...ccStyle(c), width: `${Math.min(100, (v / Math.max(t.budget, T.spent, 1)) * 100)}%` }} />
          ))}
        </div>
        <div className="kv"><span>예약·결제 (여행 전)</span><b className="num">{krw(T.pre)}</b></div>
        <div className="kv" style={{ marginTop: 4 }}><span>여행 중 지출</span><b className="num">{krw(T.spent - T.pre)}</b></div>
        {rem < 0 ? (
          <div className="hint bad"><Icon name="info" />예산을 {krw(-rem)} 넘었어요.</div>
        ) : dd.state === 'before' ? (
          <div className="hint"><Icon name="info" /><span>예약비를 빼면 현지에서 하루 <b className="num">{krw(perDay)}</b> (약 {fmt(Math.round(perDay / t.rate), t.cur)}) 쓸 수 있어요.</span></div>
        ) : dd.state === 'during' ? (
          <div className="hint"><Icon name="info" /><span>남은 {left}일 동안 하루 <b className="num">{krw(rem / left)}</b>씩 쓰면 딱 맞아요.</span></div>
        ) : null}
      </section>
      <button className="fx" onClick={() => open(<RateSheet trip={t} />)}>
        <span>환율 <b>{rateLabel(t)}</b></span>
        <span>{t.cur === 'KRW' ? '' : t.rateAuto === false ? '직접 입력 · 바꾸기' : t.rateAt ? `실시간 · ${ago(t.rateAt)}` : '기본값 · 불러오는 중'}</span>
      </button>

      <section className="sec">
        <div className="sec-h"><h2>결제수단 · 현금</h2></div>
        <div className="card">
          <div className="paygrid">
            {(Object.keys(PAYS) as PayMethod[]).map((p) => (
              <div key={p}>{PAYS[p]}<b>{krw(T.byPay[p])}</b></div>
            ))}
          </div>
          {t.cur !== 'KRW' && (
            <div className="cashbox">
              <div>
                <small>지갑에 남은 현금</small>
                <span className={'num lg' + (cashLeft < 0 ? ' neg' : '')}>{fmt(cashLeft, t.cur)}</span>
                <small>환전 {fmt(t.cash, t.cur)} · 현금 사용 {fmt(T.cashLocal, t.cur)}</small>
              </div>
              <button className="pill-btn" onClick={() => open(<CashSheet trip={t} />)}>환전 추가</button>
            </div>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>정산</h2><small>나누기 설정 반영</small></div>
        <div className="card">
          {Math.abs(b) < 500 ? (
            <p className="sub" style={{ margin: 0 }}>지금은 정산할 돈이 없어요. 딱 맞아요.</p>
          ) : (
            <div className="settle">
              <div className="person"><span className={'av ' + from}>{people[from].name.slice(0, 1)}</span>{people[from].name}</div>
              <div className="arrow"><b>{krw(Math.abs(b))}</b><span className="ln" /><small className="muted" style={{ fontSize: 12 }}>보내면 끝</small></div>
              <div className="person"><span className={'av ' + to}>{people[to].name.slice(0, 1)}</span>{people[to].name}</div>
            </div>
          )}
          <div className="paid">
            <div>{people.m.name}가 낸 돈<b>{krw(T.paid.m)}</b></div>
            <div>{people.g.name}가 낸 돈<b>{krw(T.paid.g)}</b></div>
          </div>
          {T.paid.common > 0 && (
            <div className="kv" style={{ marginTop: 10 }}><span>공용 지갑에서 낸 돈 (정산 제외)</span><b className="num">{krw(T.paid.common)}</b></div>
          )}
        </div>
      </section>

      {cats.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>어디에 썼나</h2></div>
          <div className="card cats">
            {cats.map(([c, v]) => (
              <div className="cat-row" key={c} style={ccStyle(c)}>
                <span className="cat-ic"><Icon name={c} /></span>
                <div><div className="nm">{CATS[c]}</div><div className="mini"><i style={{ width: `${(v / T.spent) * 100}%` }} /></div></div>
                <div className="v">{krw(v)}<small>{Math.round((v / T.spent) * 100)}%</small></div>
              </div>
            ))}
          </div>
        </section>
      )}

      </div>
      <div className="pg-b">
      <section className="sec">
        <div className="sec-h"><h2>지출 내역</h2><small>{t.exp.length}건</small></div>
        {groups.length ? (
          groups.map(([d, es]) => (
            <div className="sec" style={{ gap: 6 }} key={d}>
              <div className="grp-h"><span>{d === 'pre' ? '여행 전 예약·결제' : mdw(d)}</span><span className="num">{krw(es.reduce((s, e) => s + toK(e, t), 0))}</span></div>
              <div className="list">
                {[...es].reverse().map((e) => (
                  <button className="xrow" key={e.id} style={ccStyle(e.cat)} onClick={() => open(<ExpenseSheet trip={t} id={e.id} />)}>
                    <span className="cat-ic"><Icon name={e.cat} /></span>
                    <span className="t">
                      <b>{e.title || CATS[e.cat]}</b>
                      <small><i className={'who ' + e.payer} />{e.payer === 'common' ? '공용' : people[e.payer].name} · {PAYS[e.pay]}{e.payer !== 'common' && e.split !== 'half' ? ' · ' + (e.split === 'payer' ? '본인 부담' : '상대 몫') : ''}</small>
                    </span>
                    <span className="v"><b>{fmt(e.amt, e.cur)}</b>{e.cur !== 'KRW' && <small>{krw(toK(e, t))}</small>}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty"><b>아직 지출이 없어요</b>오른쪽 아래 버튼으로 3초 만에 기록해요.</div>
        )}
      </section>
      </div>
    </div>
  );
}

/* ================= 준비물 ================= */
export function CheckTab() {
  const t = useCurrentTrip();
  const { people } = useData();
  const [text, setText] = useState('');
  const groups = Array.from(new Set(t.check.map((c) => c.group)));
  const [group, setGroup] = useState(groups[0] ?? '짐');
  const done = t.check.filter((c) => c.done).length;
  const tot = t.check.length;
  const C = 2 * Math.PI * 24;
  const wl: Record<Who, string> = { m: people.m.name, g: people.g.name, both: '같이' };
  const next: Record<Who, Who> = { m: 'g', g: 'both', both: 'm' };

  return (
    <>
      <div className="ck-top">
      <section className="card prog">
        <svg className="ring" viewBox="0 0 54 54" aria-hidden="true">
          <circle className="bg" cx="27" cy="27" r="24" />
          <circle className="fg" cx="27" cy="27" r="24" strokeDasharray={C} strokeDashoffset={C * (1 - (tot ? done / tot : 0))} transform="rotate(-90 27 27)" />
        </svg>
        <div>
          <b>{tot - done ? `${tot - done}개 남았어요` : '준비 끝!'}</b>
          <p className="sub" style={{ margin: 0 }}>{tot}개 중 {done}개 완료 · 담당자를 누르면 바뀌어요</p>
        </div>
      </section>
      <form
        className="addck"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          updateTrip(t.id, (x) => void x.check.push({ id: uid(), group, text: text.trim(), who: 'both', done: false }));
          setText('');
        }}
      >
        <input className="inp" placeholder="준비물이나 할 일 추가" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" aria-label="추가할 항목" />
        <select className="inp" style={{ width: 92 }} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="분류">
          {Array.from(new Set([...groups, '서류', '예약', '짐', '할 일'])).map((g) => <option key={g}>{g}</option>)}
        </select>
        <button className="primary" style={{ width: 'auto', padding: '0 16px' }} aria-label="추가"><Icon name="plus" size={20} /></button>
      </form>
      </div>
      <div className="ck-groups">
      {groups.map((g) => {
        const its = t.check.filter((c) => c.group === g);
        return (
          <section className="sec" style={{ gap: 6 }} key={g}>
            <div className="grp-h"><span>{g}</span><span>{its.filter((c) => c.done).length}/{its.length}</span></div>
            <div className="list">
              {its.map((c) => (
                <div className={'ck' + (c.done ? ' done' : '')} key={c.id}>
                  <button className="box" aria-label={c.done ? '완료 취소' : '완료'} aria-pressed={c.done} onClick={() => updateTrip(t.id, (x) => { const it = x.check.find((y) => y.id === c.id)!; it.done = !it.done; })}>
                    <Icon name="check" />
                  </button>
                  <span className="txt">{c.text}</span>
                  <button className={'whochip ' + c.who} onClick={() => updateTrip(t.id, (x) => { const it = x.check.find((y) => y.id === c.id)!; it.who = next[it.who]; })}>{wl[c.who]}</button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      </div>
    </>
  );
}

/* ================= 예약·정보 ================= */
function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return <div className="irow"><span className="cat-ic"><Icon name={icon} /></span><div><small>{label}</small><p>{children}</p></div></div>;
}

export function InfoTab() {
  const t = useCurrentTrip();
  const { open } = useUI();
  const copy = useCopy();
  const c = COUNTRY[t.country];
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => setClock(localTime(c.tzid));
    tick();
    const h = setInterval(tick, 15000);
    return () => clearInterval(h);
  }, [c.tzid]);
  const bs = [...t.book].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return (
    <div className="pg">
      <div className="pg-a">
      <section className="sec">
        <div className="sec-h"><h2>예약 보관함</h2><small>{bs.length}건</small></div>
        {bs.length ? (
          <div className="list">
            {bs.map((b) => (
              <button className="bk" key={b.id} style={ccStyle(b.type)} onClick={() => open(<BookingView trip={t} id={b.id} />)}>
                <span className="cat-ic"><Icon name={b.type} /></span>
                <span className="t"><b>{b.title}</b><small>{b.date ? mdw(b.date) : ''} {b.time}{b.img ? ' · 바우처 있음' : ''}</small></span>
                <span className="code-s">{b.code || '-'}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty"><b>보관된 예약이 없어요</b>항공권, 숙소, 입장권의 예약번호와 바우처를 모아두세요.</div>
        )}
        <button className="add-row" onClick={() => open(<BookingSheet trip={t} />)}>+ 예약 추가</button>
      </section>

      </div>
      <div className="pg-b">
      <section className="sec">
        <div className="sec-h"><h2>{c.name} 현지 정보</h2></div>
        <div className="card info">
          <div className="irow">
            <span className="cat-ic"><Icon name="clock" /></span>
            <div><small>지금 현지 시각</small><div className="clock">{clock}</div><p className="muted" style={{ fontSize: 13 }}>{c.tz}</p></div>
          </div>
          <Row icon="plug" label="전압 · 콘센트">{c.volt}</Row>
          <Row icon="coin" label="팁">{c.tip}</Row>
          <Row icon="pass" label="입국">{c.entry}</Row>
          <div className="irow">
            <span className="cat-ic" style={{ '--cc': 'var(--bad)' } as React.CSSProperties}><Icon name="phone" /></span>
            <div>
              <small>긴급 연락처 (누르면 복사)</small>
              <div className="sos">
                {c.sos.map(([l, n]) => (
                  <button key={l} onClick={() => copy(n)}><small>{l}</small><b>{n}</b></button>
                ))}
                <button onClick={() => copy(CONSULATE_CALL)}><small>영사콜센터 24시간</small><b>{CONSULATE_CALL}</b></button>
              </div>
            </div>
          </div>
        </div>
        <p className="note">입국 규정은 바뀔 수 있어요. 출발 전에 외교부 해외안전여행 사이트에서 한 번 더 확인하세요.</p>
      </section>

      <section className="card offline">
        <span className="cat-ic"><Icon name="offline" /></span>
        <div><b>오프라인 보기</b><p>다음 단계에서 이 여행의 일정, 예약번호, 바우처를 폰에 저장해서 비행기 모드에서도 열리게 만들어요.</p></div>
      </section>
      </div>
    </div>
  );
}
