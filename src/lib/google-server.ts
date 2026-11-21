/** 서버에서 구글 API를 부를 때 쓰는 공통 부분 */
export const SERVER_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || 'AIzaSyCN6dOXRsnO5QDgGE75fUHzwzgbalqi-sw';

/** 키가 웹사이트 주소로 제한돼 있어서, 앱 주소를 Referer로 붙여 보낸다 */
export function googleHeaders(req: Request, fieldMask: string): HeadersInit {
  const origin = req.headers.get('origin') || (req.headers.get('host') ? `https://${req.headers.get('host')}` : '');
  return {
    'content-type': 'application/json',
    'X-Goog-Api-Key': SERVER_KEY,
    'X-Goog-FieldMask': fieldMask,
    ...(origin ? { Referer: origin + '/' } : {}),
  };
}

export const noKey = () => new Response('지도 키가 아직 연결되지 않았어요', { status: 503 });

export interface PlaceHit {
  name: string;
  addr: string;
  lat: number;
  lng: number;
  placeId?: string;
  /** 구글 장소 종류 (restaurant, cafe, lodging …) */
  kind?: string;
}

export async function textSearch(req: Request, q: string, bias?: [number, number], radius = 30000): Promise<PlaceHit[]> {
  const body: Record<string, unknown> = { textQuery: q, languageCode: 'ko', maxResultCount: 6 };
  if (bias) body.locationBias = { circle: { center: { latitude: bias[0], longitude: bias[1] }, radius } };
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: googleHeaders(req, 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType'),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`places ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { places?: { id: string; displayName?: { text: string }; formattedAddress?: string; location: { latitude: number; longitude: number }; primaryType?: string }[] };
  return (j.places ?? []).map((p) => ({ name: p.displayName?.text ?? '', addr: p.formattedAddress ?? '', lat: p.location.latitude, lng: p.location.longitude, placeId: p.id, kind: p.primaryType }));
}

/** 주변 추천 종류 → 구글 장소 종류 */
export const NEAR_TYPES = {
  food: { types: ['restaurant'], radius: 900 },
  cafe: { types: ['cafe', 'bakery', 'dessert_shop', 'coffee_shop'], radius: 900 },
  sight: { types: ['tourist_attraction', 'museum', 'park', 'art_gallery', 'shopping_mall'], radius: 1800 },
  bar: { types: ['bar', 'pub', 'wine_bar'], radius: 900 },
} as const;
export type NearKind = keyof typeof NEAR_TYPES;

export interface NearHit extends PlaceHit {
  rating?: number;
  reviews?: number;
  type?: string;
  open?: boolean;
  price?: number;
  url?: string;
  summary?: string;
}

const PRICE: Record<string, number> = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4 };

export async function nearbySearch(req: Request, at: [number, number], kind: NearKind): Promise<NearHit[]> {
  const k = NEAR_TYPES[kind];
  let r = await callNearby(req, at, [...k.types], k.radius);
  // 구글이 모르는 종류가 섞여 거절하면 대표 종류 하나로 다시
  if (r.status === 400) r = await callNearby(req, at, [k.types[0]], k.radius);
  if (!r.ok) throw new Error(`nearby ${r.status}: ${await r.text()}`);
  return toNear(r);
}

function callNearby(req: Request, at: [number, number], types: string[], radius: number) {
  return fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: googleHeaders(
      req,
      'places.id,places.displayName,places.shortFormattedAddress,places.location,places.primaryType,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.priceLevel,places.googleMapsUri,places.editorialSummary',
    ),
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      languageCode: 'ko',
      locationRestriction: { circle: { center: { latitude: at[0], longitude: at[1] }, radius } },
    }),
  });
}

async function toNear(r: Response): Promise<NearHit[]> {
  type P = {
    id: string; displayName?: { text: string }; shortFormattedAddress?: string; location: { latitude: number; longitude: number };
    primaryType?: string; primaryTypeDisplayName?: { text: string }; rating?: number; userRatingCount?: number;
    currentOpeningHours?: { openNow?: boolean }; priceLevel?: string; googleMapsUri?: string; editorialSummary?: { text: string };
  };
  const j = (await r.json()) as { places?: P[] };
  return (j.places ?? []).map((p) => ({
    name: p.displayName?.text ?? '',
    addr: p.shortFormattedAddress ?? '',
    lat: p.location.latitude,
    lng: p.location.longitude,
    placeId: p.id,
    kind: p.primaryType,
    type: p.primaryTypeDisplayName?.text,
    rating: p.rating,
    reviews: p.userRatingCount,
    open: p.currentOpeningHours?.openNow,
    price: p.priceLevel ? PRICE[p.priceLevel] : undefined,
    url: p.googleMapsUri,
    summary: p.editorialSummary?.text,
  }));
}
