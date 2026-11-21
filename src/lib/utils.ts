import { CUR, WD } from './constants';
import type { CurCode, Expense, Trip } from './types';

/** 만든 순서대로 정렬되는 id (시간 + 순번 + 무작위) */
let seq = 0;
export const uid = () =>
  Date.now().toString(36).padStart(9, '0') +
  (seq++ % 1296).toString(36).padStart(2, '0') +
  Math.random().toString(36).slice(2, 6);

export const pd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => iso(new Date());
export const md = (s: string) => {
  const d = pd(s);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};
export const mdw = (s: string) => {
  const d = pd(s);
  return `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`;
};
export const mins = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const dur = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ' ' + (m % 60) + '분' : ''}` : `${m}분`;

export function daysOf(t: Pick<Trip, 'start' | 'end'>): string[] {
  const a: string[] = [];
  for (let d = pd(t.start); d <= pd(t.end); d.setDate(d.getDate() + 1)) a.push(iso(d));
  return a;
}

export const krw = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
export const fmt = (a: number, c: CurCode) =>
  CUR[c].sym + Number(a).toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: CUR[c].dec });
export const toK = (e: Pick<Expense, 'amt' | 'cur'>, t: Trip) =>
  e.cur === 'KRW' ? e.amt : e.amt * (e.cur === t.cur ? t.rate : CUR[e.cur].rate);
export const rateLabel = (t: Trip) => {
  const C = CUR[t.cur];
  return `${C.unit.toLocaleString('ko-KR')}${C.name} = ${Math.round(t.rate * C.unit).toLocaleString('ko-KR')}원`;
};
export const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
export const mapUrl = (q: string) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
export const digits = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;

export type TripPhase = 'before' | 'during' | 'after';
export function dday(t: Trip): { txt: string; cls: string; state: TripPhase } {
  const T = today();
  const diff = Math.round((pd(t.start).getTime() - pd(T).getTime()) / 864e5);
  if (diff > 0) return { txt: 'D-' + diff, cls: 'sun', state: 'before' };
  if (T <= t.end) return { txt: `여행 ${1 - diff}일째`, cls: 'accent', state: 'during' };
  return { txt: '다녀옴', cls: '', state: 'after' };
}

export function totals(t: Trip) {
  let spent = 0,
    pre = 0,
    cashLocal = 0;
  const paid = { m: 0, g: 0, common: 0 },
    owe = { m: 0, g: 0 },
    byCat: Record<string, number> = {},
    byPay = { card: 0, travel: 0, cash: 0 };
  for (const e of t.exp) {
    const k = toK(e, t);
    spent += k;
    if (e.date === 'pre') pre += k;
    paid[e.payer] += k;
    byCat[e.cat] = (byCat[e.cat] || 0) + k;
    byPay[e.pay] += k;
    if (e.pay === 'cash' && e.cur === t.cur) cashLocal += e.amt;
    if (e.payer === 'common') continue;
    const other = e.payer === 'm' ? 'g' : 'm';
    if (e.split === 'half') {
      owe.m += k / 2;
      owe.g += k / 2;
    } else if (e.split === 'payer') owe[e.payer] += k;
    else owe[other] += k;
  }
  /** > 0 : g owes m */
  return { spent, pre, paid, byCat, byPay, cashLocal, bal: paid.m - owe.m };
}

export function localTime(tzid: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: tzid, hour: 'numeric', minute: '2-digit' }).format(new Date());
}

export function compressImage(file: File, max = 1280, quality = 0.72): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = rej;
    r.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', quality));
      };
      img.src = r.result as string;
    };
    r.readAsDataURL(file);
  });
}
