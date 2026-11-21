import type { Booking, Cat, CheckItem, Expense, Mode, PayMethod, Person, PlanItem, Split, Trip, Who, Wish } from './types';
import { CUR } from './constants';
import { uid } from './utils';

/** 처음 써보는 사람을 위한 예시 여행. 홈의 "예시 여행 둘러보기"로만 추가된다. */
export function sampleTrip(): Trip {
  const T = (mode: Mode, min: number) => ({ mode, min });
  const P = (date: string, time: string, type: Cat, title: string, note = '', place = '', travel: PlanItem['travel'] = null): PlanItem => ({ id: uid(), date, time, type, title, note, place, travel });
  const E = (date: string, amt: number, cur: Expense['cur'], cat: Cat, payer: Person, title: string, pay: PayMethod = 'card', split: Split = 'half'): Expense => ({ id: uid(), date, amt, cur, cat, payer, title, pay, split });
  const C = (group: string, text: string, who: Who, done = false): CheckItem => ({ id: uid(), group, text, who, done });
  const B = (type: Cat, title: string, code: string, date: string, time: string, detail: string): Booking => ({ id: uid(), type, title, code, date, time, detail, img: null });
  const W = (title: string, type: Cat, url: string, place: string, note: string, planId: string | null = null): Wish => ({ id: uid(), title, type, url, place, note, planId });
  const tower = P('2026-12-25', '19:00', 'sight', '도쿄타워 크리스마스 야경', '', 'Tokyo Tower', T('subway', 30));
  return {
    id: uid(), name: '(예시) 도쿄 크리스마스', country: 'JP', from: 'ICN', fromName: '인천', to: 'NRT', toName: '도쿄 나리타',
    start: '2026-12-24', end: '2026-12-28', cur: 'JPY', rate: CUR.JPY.rate, budget: 2500000, cash: 30000,
    weather: null,
    plan: [
      P('2026-12-24', '07:30', 'move', '인천공항 2터미널 도착', '대한항공 체크인 카운터 E'),
      P('2026-12-24', '10:05', 'flight', 'KE703 인천 → 나리타', '12:30 도착 · 좌석 32A, 32B'),
      P('2026-12-24', '13:30', 'move', '스카이라이너로 우에노', '편도 약 45분', 'Keisei Ueno Station'),
      P('2026-12-24', '15:00', 'stay', '호텔 체크인', '미쓰이 가든 호텔 우에노', 'Mitsui Garden Hotel Ueno', T('walk', 8)),
      P('2026-12-24', '18:30', 'food', '아메요코 시장에서 저녁', '꼬치랑 해산물덮밥', 'Ameyoko Shopping Street', T('walk', 10)),
      P('2026-12-25', '09:00', 'food', '츠키지 장외시장 아침', '계란말이 꼭 먹기', 'Tsukiji Outer Market', T('subway', 20)),
      P('2026-12-25', '09:40', 'sight', '긴자 산책', '', 'Ginza', T('walk', 15)),
      P('2026-12-25', '14:00', 'sight', '팀랩 플래닛', '바지 걷을 수 있는 옷', 'teamLab Planets TOKYO', T('subway', 25)),
      tower,
      P('2026-12-26', '10:00', 'sight', '시부야 스카이', '', 'Shibuya Sky', T('subway', 30)),
      P('2026-12-26', '13:00', 'shop', '하라주쿠 캣스트리트', '', 'Cat Street Harajuku', T('walk', 15)),
      P('2026-12-26', '18:00', 'food', '신주쿠 오모이데요코초', '', 'Omoide Yokocho', T('subway', 10)),
      P('2026-12-27', '08:30', 'move', '로망스카 타고 하코네', '신주쿠역 출발', 'Shinjuku Station', T('subway', 25)),
      P('2026-12-27', '12:00', 'sight', '오와쿠다니', '검은 달걀', 'Owakudani', T('train', 150)),
      P('2026-12-27', '16:00', 'sight', '당일치기 온천', '수건 챙기기', 'Hakone Yuryo', T('bus', 30)),
      P('2026-12-28', '11:00', 'stay', '체크아웃', '짐은 호텔에 맡기기'),
      P('2026-12-28', '13:00', 'sight', '우에노 공원', '', 'Ueno Park', T('walk', 10)),
      P('2026-12-28', '17:40', 'flight', 'KE704 나리타 → 인천', '15:30까지 공항 도착', 'Narita Airport Terminal 1', T('train', 60)),
    ],
    exp: [
      E('pre', 684000, 'KRW', 'flight', 'm', '대한항공 왕복 2인'),
      E('pre', 89400, 'JPY', 'stay', 'g', '미쓰이 가든 호텔 4박'),
      E('pre', 7600, 'JPY', 'sight', 'm', '팀랩 플래닛 2인', 'travel'),
      E('pre', 5780, 'JPY', 'move', 'g', '스카이라이너 왕복 2인', 'travel'),
      E('pre', 4940, 'JPY', 'move', 'm', '로망스카 왕복 2인'),
      E('pre', 6000, 'JPY', 'sight', 'g', '시부야 스카이 2인'),
      E('pre', 38000, 'KRW', 'etc', 'g', '여행자보험 2인'),
      E('pre', 24000, 'KRW', 'etc', 'm', '포켓 와이파이 5일'),
    ],
    book: [
      B('flight', 'KE703 인천 → 나리타', 'X7K2QP', '2026-12-24', '10:05', '인천 T2 → 나리타 T1 · 좌석 32A, 32B · 위탁 23kg 1개씩'),
      B('move', '스카이라이너 교환권', 'KSL55031', '2026-12-24', '13:30', '나리타 공항역 매표소에서 실물 티켓으로 교환'),
      B('stay', '미쓰이 가든 호텔 우에노', 'MG-20431', '2026-12-24', '15:00', '체크아웃 12/28 11:00 · 더블룸 · 조식 포함'),
      B('sight', '팀랩 플래닛', 'TLP482193', '2026-12-25', '14:00', 'QR 코드로 입장 · 입장 30분 전부터 줄 서기'),
      B('sight', '시부야 스카이', 'SS77120', '2026-12-26', '10:00', '옥상 짐 보관함 이용 (코인 필요)'),
      B('flight', 'KE704 나리타 → 인천', 'X7K2QP', '2026-12-28', '17:40', '나리타 T1 · 출발 2시간 전 도착'),
    ],
    wish: [
      W('이치란 라멘 시부야', 'food', 'https://www.instagram.com/', 'Ichiran Shibuya', '24시간 영업, 줄 짧은 밤에'),
      W('아자부다이 힐스 전망대', 'sight', 'https://blog.naver.com/', 'Azabudai Hills', ''),
      W('나카메구로 카페 거리', 'food', '', 'Nakameguro', '강가 따라 산책하면서'),
      W('도쿄타워 야경', 'sight', 'https://www.instagram.com/', 'Tokyo Tower', '크리스마스 조명', tower.id),
      W('돈키호테 시부야', 'shop', '', 'Don Quijote Shibuya', '면세 여권 챙기기'),
    ],
    check: [
      C('서류', '여권 유효기간 확인', 'both', true), C('서류', 'Visit Japan Web 등록', 'm'), C('서류', '여행자보험 가입', 'g', true),
      C('예약', '항공권', 'm', true), C('예약', '숙소', 'g', true), C('예약', '크리스마스 저녁 레스토랑', 'm'),
      C('짐', '보조배터리 (기내 반입)', 'm'), C('짐', '돼지코 어댑터 110V', 'g'), C('짐', '상비약', 'both'),
    ],
  };
}

export function starterChecklist(): CheckItem[] {
  return [
    { id: uid(), group: '서류', text: '여권 유효기간 확인', who: 'both', done: false },
    { id: uid(), group: '서류', text: '여행자보험 가입', who: 'both', done: false },
    { id: uid(), group: '예약', text: '항공권', who: 'm', done: false },
    { id: uid(), group: '예약', text: '숙소', who: 'g', done: false },
    { id: uid(), group: '짐', text: '충전기 · 보조배터리', who: 'both', done: false },
  ];
}
