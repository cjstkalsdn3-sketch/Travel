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

export const CATS: Record<Cat, string> = { flight: '항공', stay: '숙소', food: '식비', move: '교통', sight: '관광', shop: '쇼핑', etc: '기타' };
export const PAYS: Record<PayMethod, string> = { card: '카드', travel: '트래블카드', cash: '현금' };
export const MODES: Record<Mode, string> = { subway: '지하철', walk: '도보', bus: '버스', train: '기차', taxi: '택시' };
export const WXL: Record<Wx, string> = { sun: '맑음', cloud: '구름 많음', rain: '비', snow: '눈' };
export const WD = '일월화수목금토';
