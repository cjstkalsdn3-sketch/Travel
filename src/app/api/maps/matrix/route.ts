import { SERVER_KEY, googleHeaders, noKey } from '@/lib/google-server';

type Mode = 'WALK' | 'TRANSIT';
interface El {
  originIndex?: number;
  destinationIndex?: number;
  duration?: string;
  condition?: string;
}

async function matrix(req: Request, pts: [number, number][], mode: Mode, departure?: string): Promise<(number | null)[][]> {
  const wp = pts.map(([lat, lng]) => ({ waypoint: { location: { latLng: { latitude: lat, longitude: lng } } } }));
  const body: Record<string, unknown> = { origins: wp, destinations: wp, travelMode: mode };
  if (mode === 'TRANSIT' && departure && new Date(departure) > new Date()) body.departureTime = departure;
  const r = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
    method: 'POST',
    headers: googleHeaders(req, 'originIndex,destinationIndex,duration,condition'),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`routes ${mode} ${r.status}: ${await r.text()}`);
  const els = (await r.json()) as El[];
  const m: (number | null)[][] = pts.map(() => pts.map(() => null));
  for (const e of els) {
    const i = e.originIndex ?? 0;
    const j = e.destinationIndex ?? 0;
    if (e.condition === 'ROUTE_EXISTS' && e.duration) m[i][j] = Math.max(1, Math.ceil(parseInt(e.duration) / 60));
  }
  for (let i = 0; i < pts.length; i++) m[i][i] = 0;
  return m;
}

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { points, departure } = (await req.json()) as { points?: [number, number][]; departure?: string };
  if (!points || points.length < 2) return Response.json({ m: [] });
  if (points.length > 10) return new Response('한 번에 10곳까지만 계산할 수 있어요', { status: 400 });
  try {
    const [walk, transit] = await Promise.all([matrix(req, points, 'WALK'), matrix(req, points, 'TRANSIT', departure).catch(() => points.map(() => points.map(() => null)))]);
    return Response.json({ m: walk.map((row, i) => row.map((w, j) => ({ walk: w, transit: transit[i][j] }))) });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
