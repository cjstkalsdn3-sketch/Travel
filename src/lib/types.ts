export type Person = 'm' | 'g';
export type Who = Person | 'both';
export type Cat = 'flight' | 'stay' | 'food' | 'move' | 'sight' | 'shop' | 'etc';
export type CurCode = 'JPY' | 'USD' | 'EUR' | 'THB' | 'TWD' | 'VND' | 'KRW';
export type CountryCode = 'JP' | 'TW' | 'TH' | 'VN' | 'US' | 'FR' | 'IT' | 'ES';
export type PayMethod = 'card' | 'travel' | 'cash';
export type Split = 'half' | 'payer' | 'other';
export type Mode = 'subway' | 'walk' | 'bus' | 'train' | 'taxi';
export type Wx = 'sun' | 'cloud' | 'rain' | 'snow';

/** 'pre' = 여행 전 예약·결제, otherwise YYYY-MM-DD */
export type ExpenseDate = 'pre' | string;

export interface Travel {
  mode: Mode;
  min: number;
}

export interface PlanItem {
  id: string;
  date: string;
  time: string; // HH:MM
  type: Cat;
  title: string;
  note: string;
  place: string;
  travel: Travel | null;
}

export interface Expense {
  id: string;
  date: ExpenseDate;
  amt: number;
  cur: CurCode;
  cat: Cat;
  payer: Person;
  pay: PayMethod;
  split: Split;
  title: string;
}

export interface CheckItem {
  id: string;
  group: string;
  text: string;
  who: Who;
  done: boolean;
}

export interface Booking {
  id: string;
  type: Cat;
  title: string;
  code: string;
  date: string;
  time: string;
  detail: string;
  img: string | null;
}

export interface Wish {
  id: string;
  title: string;
  type: Cat;
  url: string;
  place: string;
  note: string;
  planId: string | null;
}

export interface Trip {
  id: string;
  name: string;
  country: CountryCode;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  start: string;
  end: string;
  cur: CurCode;
  /** KRW per 1 unit of `cur` */
  rate: number;
  budget: number;
  /** total local cash exchanged */
  cash: number;
  weather: Record<string, [Wx, number, number]> | null;
  plan: PlanItem[];
  exp: Expense[];
  book: Booking[];
  wish: Wish[];
  check: CheckItem[];
}

export interface AppData {
  version: 1;
  people: Record<Person, { name: string }>;
  last: { payer: Person; pay: PayMethod };
  trips: Trip[];
}
