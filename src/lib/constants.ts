import type { Cat, CountryCode, CurCode, Mode, PayMethod, Wx } from './types';

export interface CurrencyInfo {
  sym: string;
  name: string;
  /** default KRW per unit (예시 값, 실제 환율 연동 전까지 사용) */
  rate: number;
  /** unit used when showing the rate, e.g. 100엔 */
  unit: number;
  dec: number;
  quick: number[];
}

export const CUR: Record<CurCode, CurrencyInfo> = {
  JPY: { sym: '¥', name: '엔', rate: 9.12, unit: 100, dec: 0, quick: [10000, 30000, 50000] },
  USD: { sym: '$', name: '달러', rate: 1395, unit: 1, dec: 2, quick: [100, 200, 500] },
  EUR: { sym: '€', name: '유로', rate: 1612, unit: 1, dec: 2, quick: [100, 200, 500] },
  THB: { sym: '฿', name: '바트', rate: 41.2, unit: 1, dec: 2, quick: [1000, 3000, 5000] },
  TWD: { sym: 'NT$', name: '대만달러', rate: 43.6, unit: 1, dec: 0, quick: [1000, 3000, 5000] },
  VND: { sym: '₫', name: '동', rate: 0.055, unit: 10000, dec: 0, quick: [1000000, 2000000, 5000000] },
  KRW: { sym: '₩', name: '원', rate: 1, unit: 1, dec: 0, quick: [] },
};

export interface CountryInfo {
  name: string;
  cur: CurCode;
  tzid: string;
  tz: string;
  volt: string;
  tip: string;
  entry: string;
  sos: [string, string][];
  /** 지도 기본 중심 */
  center: [number, number];
  /** UTC 기준 시차(시간, 표준시) */
  utc: number;
}

const EU_TIP = '봉사료가 포함돼 있어서 필수는 아니에요. 잔돈 정도 두면 충분해요.';
const EU_ENTRY = '쉥겐 지역 90일 무비자 · ETIAS(사전 여행허가) 시행 여부를 출국 전에 확인하세요.';
const EU_VOLT = '230V · 한국 플러그가 그대로 맞아요';
const EU_TZ = '한국보다 8시간 느려요 (서머타임엔 7시간)';

export const COUNTRY: Record<CountryCode, CountryInfo> = {
  JP: { name: '일본', cur: 'JPY', tzid: 'Asia/Tokyo', tz: '한국과 같아요 (시차 없음)', volt: '100V · 11자 납작 핀(A타입)이라 돼지코 어댑터가 필요해요', tip: '팁 문화가 없어요. 주면 오히려 당황해요.', entry: '90일 무비자 · Visit Japan Web에 미리 등록하면 입국 심사가 빨라요.', sos: [['경찰', '110'], ['구급·화재', '119']], center: [35.681,139.767], utc: 9 },
  TW: { name: '대만', cur: 'TWD', tzid: 'Asia/Taipei', tz: '한국보다 1시간 느려요', volt: '110V · 11자 납작 핀(A타입)이라 돼지코 어댑터가 필요해요', tip: '팁 문화가 없어요. 식당 계산서에 봉사료 10%가 붙기도 해요.', entry: '90일 무비자 · 입국신고서는 온라인으로 미리 작성할 수 있어요.', sos: [['경찰', '110'], ['구급·화재', '119']], center: [25.033,121.565], utc: 8 },
  TH: { name: '태국', cur: 'THB', tzid: 'Asia/Bangkok', tz: '한국보다 2시간 느려요', volt: '220V · 한국 플러그가 대부분 맞아요', tip: '필수는 아니지만 마사지나 호텔에선 20~100바트 정도 주는 편이에요.', entry: '무비자 입국 가능 (허용 일수는 출국 전 확인) · 태국 디지털 입국카드(TDAC)를 미리 등록하세요.', sos: [['관광경찰', '1155'], ['경찰', '191'], ['구급', '1669']], center: [13.756,100.502], utc: 7 },
  VN: { name: '베트남', cur: 'VND', tzid: 'Asia/Ho_Chi_Minh', tz: '한국보다 2시간 느려요', volt: '220V · 한국 플러그가 대부분 맞아요', tip: '필수는 아니에요. 마사지 등에선 소액 팁을 주기도 해요.', entry: '45일 무비자', sos: [['경찰', '113'], ['화재', '114'], ['구급', '115']], center: [16.054,108.202], utc: 7 },
  US: { name: '미국', cur: 'USD', tzid: 'America/New_York', tz: '동부 기준 14시간 느려요 (서머타임엔 13시간, 서부는 3시간 더)', volt: '120V · 11자 납작 핀(A/B타입)이라 돼지코 어댑터가 필요해요', tip: '식당 15~20%, 택시 15% 정도가 기본이에요.', entry: 'ESTA 사전 승인이 꼭 필요해요. 출발 72시간 전까지 받아두세요.', sos: [['경찰·구급·화재', '911']], center: [40.713,-74.006], utc: -5 },
  FR: { name: '프랑스', cur: 'EUR', tzid: 'Europe/Paris', tz: EU_TZ, volt: EU_VOLT, tip: EU_TIP, entry: EU_ENTRY, sos: [['유럽 공통 긴급', '112']], center: [48.857,2.352], utc: 1 },
  IT: { name: '이탈리아', cur: 'EUR', tzid: 'Europe/Rome', tz: EU_TZ, volt: EU_VOLT, tip: EU_TIP, entry: EU_ENTRY, sos: [['유럽 공통 긴급', '112']], center: [41.903,12.496], utc: 1 },
  ES: { name: '스페인', cur: 'EUR', tzid: 'Europe/Madrid', tz: EU_TZ, volt: EU_VOLT, tip: EU_TIP, entry: EU_ENTRY, sos: [['유럽 공통 긴급', '112']], center: [40.417,-3.704], utc: 1 },
};

export const CONSULATE_CALL = '+82-2-3210-0404';

export const CATS: Record<Cat, string> = { flight: '항공', stay: '숙소', food: '식비', move: '교통', sight: '관광', shop: '쇼핑', etc: '기타', station: '전철역', bus: '버스' };
/** 지출에 쓰는 분류 (전철역·버스는 장소 전용) */
export const EXP_CATS: Cat[] = ['flight', 'stay', 'food', 'move', 'sight', 'shop', 'etc'];
export const PAYS: Record<PayMethod, string> = { card: '카드', travel: '트래블카드', cash: '현금' };
export const MODES: Record<Mode, string> = { subway: '지하철', walk: '도보', bus: '버스', train: '기차', taxi: '택시' };
export const WXL: Record<Wx, string> = { sun: '맑음', cloud: '구름 많음', rain: '비', snow: '눈' };
export const WD = '일월화수목금토';

/** 도착 공항 → 그 도시 중심 (장소 검색 기준 위치) */
export const AIRPORT_CITY: Record<string, [number, number]> = {
  KIX: [34.6937, 135.5023], ITM: [34.6937, 135.5023], UKB: [34.6901, 135.1955], NRT: [35.681, 139.767], HND: [35.681, 139.767],
  NGO: [35.1709, 136.8815], FUK: [33.5902, 130.4017], CTS: [43.0618, 141.3545], OKA: [26.2124, 127.6809], KOJ: [31.5966, 130.5571],
  SDJ: [38.2682, 140.8694], HIJ: [34.3853, 132.4553], KMJ: [32.8031, 130.7079], OIT: [33.2382, 131.6126], TAK: [34.3428, 134.0466],
  TPE: [25.033, 121.565], TSA: [25.033, 121.565], KHH: [22.6273, 120.3014], RMQ: [24.1477, 120.6736],
  BKK: [13.756, 100.502], DMK: [13.756, 100.502], HKT: [7.8804, 98.3923], CNX: [18.7883, 98.9853],
  DAD: [16.054, 108.202], SGN: [10.7769, 106.7009], HAN: [21.0278, 105.8342], CXR: [12.2388, 109.1967], PQC: [10.2899, 103.984],
  JFK: [40.713, -74.006], EWR: [40.713, -74.006], LAX: [34.0522, -118.2437], SFO: [37.7749, -122.4194], HNL: [21.3069, -157.8583], LAS: [36.1699, -115.1398], SEA: [47.6062, -122.3321],
  CDG: [48.857, 2.352], ORY: [48.857, 2.352], NCE: [43.7102, 7.262], FCO: [41.903, 12.496], MXP: [45.4642, 9.19], VCE: [45.4408, 12.3155], FLR: [43.7696, 11.2558], NAP: [40.8518, 14.2681],
  BCN: [41.3874, 2.1686], MAD: [40.417, -3.704], AGP: [36.7213, -4.4214], SVQ: [37.3891, -5.9845],
};

/** 고를 수 있는 공항 (코드, 짧은 이름) */
export const KR_AIRPORTS: [string, string][] = [['ICN', '인천'], ['GMP', '김포'], ['PUS', '김해(부산)'], ['CJU', '제주'], ['TAE', '대구'], ['CJJ', '청주']];
export const AIRPORTS: Record<CountryCode, [string, string][]> = {
  JP: [['KIX', '간사이(오사카)'], ['ITM', '이타미(오사카)'], ['UKB', '고베'], ['NRT', '나리타(도쿄)'], ['HND', '하네다(도쿄)'], ['NGO', '주부(나고야)'], ['FUK', '후쿠오카'], ['CTS', '신치토세(삿포로)'], ['OKA', '나하(오키나와)'], ['KOJ', '가고시마'], ['KMJ', '구마모토'], ['OIT', '오이타'], ['HIJ', '히로시마'], ['TAK', '다카마쓰'], ['SDJ', '센다이']],
  TW: [['TPE', '타오위안(타이베이)'], ['TSA', '쑹산(타이베이)'], ['KHH', '가오슝'], ['RMQ', '타이중']],
  TH: [['BKK', '수완나품(방콕)'], ['DMK', '돈므앙(방콕)'], ['HKT', '푸껫'], ['CNX', '치앙마이']],
  VN: [['DAD', '다낭'], ['SGN', '호찌민'], ['HAN', '하노이'], ['CXR', '깜라인(나트랑)'], ['PQC', '푸꾸옥']],
  US: [['JFK', '뉴욕 JFK'], ['EWR', '뉴어크(뉴욕)'], ['LAX', '로스앤젤레스'], ['SFO', '샌프란시스코'], ['LAS', '라스베이거스'], ['SEA', '시애틀'], ['HNL', '호놀룰루']],
  FR: [['CDG', '샤를드골(파리)'], ['ORY', '오를리(파리)'], ['NCE', '니스']],
  IT: [['FCO', '로마'], ['MXP', '밀라노'], ['VCE', '베네치아'], ['FLR', '피렌체'], ['NAP', '나폴리']],
  ES: [['BCN', '바르셀로나'], ['MAD', '마드리드'], ['AGP', '말라가'], ['SVQ', '세비야']],
};
/** 공항 짧은 이름 (괄호 앞까지) */
export const airportName = (code?: string) => {
  if (!code) return '';
  const all = [...KR_AIRPORTS, ...Object.values(AIRPORTS).flat()];
  return (all.find(([c]) => c === code)?.[1] ?? '').replace(/\(.*\)$/, '');
};
