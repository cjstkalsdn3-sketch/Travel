export type Person = 'm' | 'g';
export type Who = Person | 'both';
/** 'common' = 공용 지갑(둘이 같이 모은 돈)에서 냄. 정산에는 안 들어감 */
export type Payer = Person | 'common';
export type Cat = 'flight' | 'stay' | 'food' | 'move' | 'sight' | 'shop' | 'etc' | 'station' | 'bus';
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
  /** 구글로 자동 계산한 값 */
  auto?: boolean;
}

/** 지도에서 고른 장소 */
export interface Geo {
  lat: number;
  lng: number;
  placeId?: string;
  addr?: string;
}

/** 실제 날씨 (Open-Meteo). c = WMO 날씨 코드, t = 기온(°C), p = 강수 확률(%) */
export interface WxNow {
  c: number;
  t: number;
  p?: number;
  /** 지난 시간의 기록이라 더 바뀌지 않음 */
  done?: boolean;
}
export interface WxDay {
  c: number;
  hi: number;
  lo: number;
  p?: number;
  done?: boolean;
}

/** 한 일정 안에서 함께 들르는 곳 */
export interface Stop {
  id: string;
  name: string;
  geo?: Geo | null;
  type?: Cat;
  /** 담아둔 장소에서 가져왔으면 그 id */
  wishId?: string;
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
  geo?: Geo | null;
  /** 같은 날 안에서의 순서 (직접 바꾼 경우). 없으면 시간 순 */
  ord?: number;
  /** 동선 정리 때 시간·위치를 바꾸지 않음. 없으면 항공·숙소·예약은 고정 */
  fixed?: boolean;
  /** 머무는 시간(분) */
  stay?: number;
  /** 그 시간·장소의 날씨 */
  wx?: WxNow;
  /** 함께 들르는 곳 (일정 하나에 여러 장소) */
  stops?: Stop[];
}

export interface Expense {
  id: string;
  date: ExpenseDate;
  amt: number;
  cur: CurCode;
  cat: Cat;
  payer: Payer;
  pay: PayMethod;
  split: Split;
  title: string;
  /** 기록할 때의 환율(현지 1단위당 원). 없으면 여행의 현재 환율 */
  rate?: number;
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
  geo?: Geo | null;
  /** 우선순위: 1 꼭 갈 곳, -1 시간 되면. 없으면 보통 */
  prio?: 1 | -1;
}

/** 지금 안 쓰는 일정 안 (A안·B안). 지금 쓰는 안은 Trip.plan */
export interface PlanAlt {
  id: string;
  name: string;
  plan: PlanItem[];
  /** 가볼 곳 id → 이 안에서 연결된 일정 id */
  links: Record<string, string>;
}

/** 여행 기록에 붙은 사진 한 장 */
export interface Photo {
  id: string;
  /** 서버 저장소 경로 (원본 = path, 작은 그림 = path에 _t) */
  path?: string;
  /** 서버 없이 쓸 때 사진 자체 (data URL) */
  src?: string;
  w: number;
  h: number;
  /** 찍은 시각 (사진 정보에서) */
  at?: string;
  /** 아직 서버에 다 안 올라감 */
  up?: boolean;
}

/** 여행 기록 한 개: 그날의 사진 여러 장 + 짧은 글 */
export interface Memo {
  id: string;
  date: string;
  by: Person;
  text: string;
  photos: Photo[];
  /** 만든 시각 */
  at: string;
  /** 연결한 일정 (장소) */
  planId?: string | null;
}

export interface Trip {
  id: string;
  name: string;
  country: CountryCode;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  /** 오는 편 출발 공항 (없으면 to와 같음) */
  back?: string;
  /** 오는 편 도착 공항 (없으면 from과 같음) */
  home?: string;
  start: string;
  end: string;
  cur: CurCode;
  /** KRW per 1 unit of `cur` */
  rate: number;
  budget: number;
  /** total local cash exchanged */
  cash: number;
  /** (예전 예시 값, 더 쓰지 않음) */
  weather: Record<string, [Wx, number, number]> | null;
  /** 날짜별 실제 날씨 */
  wxd?: Record<string, WxDay>;
  /** 날씨를 마지막으로 받아온 시각 */
  wxAt?: string;
  /** 환율을 자동으로 맞춤(기본). false면 직접 넣은 값 유지 */
  rateAuto?: boolean;
  /** 환율을 마지막으로 받아온 시각 */
  rateAt?: string;
/** 날짜별 메인 지역 (자동 배치가 이 근처로 짬) */
  area?: Record<string, { name: string; geo?: Geo | null }>;
    plan: PlanItem[];
  /** 지금 쓰는 일정 안의 id·이름 (없으면 'A안' 하나뿐) */
  altId?: string;
  altName?: string;
  /** 다른 일정 안들 */
  alts?: PlanAlt[];
  exp: Expense[];
  book: Booking[];
  wish: Wish[];
  check: CheckItem[];
  /** 여행 기록 (사진·일기) */
  memo?: Memo[];
}

export interface AppData {
  version: 1;
  people: Record<Person, { name: string }>;
  last: { payer: Payer; pay: PayMethod };
  trips: Trip[];
}
