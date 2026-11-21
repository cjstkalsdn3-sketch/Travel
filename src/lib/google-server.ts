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
}

export async function textSearch(req: Request, q: string, bias?: [number, number], radius = 30000): Promise<PlaceHit[]> {
  const body: Record<string, unknown> = { textQuery: q, languageCode: 'ko', maxResultCount: 6 };
  if (bias) body.locationBias = { circle: { center: { latitude: bias[0], longitude: bias[1] }, radius } };
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: googleHeaders(req, 'places.id,places.displayName,places.formattedAddress,places.location'),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`places ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { places?: { id: string; displayName?: { text: string }; formattedAddress?: string; location: { latitude: number; longitude: number } }[] };
  return (j.places ?? []).map((p) => ({ name: p.displayName?.text ?? '', addr: p.formattedAddress ?? '', lat: p.location.latitude, lng: p.location.longitude, placeId: p.id }));
}
