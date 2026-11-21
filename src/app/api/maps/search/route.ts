import { SERVER_KEY, noKey, textSearch } from '@/lib/google-server';

const TYPES = ['transit_station', 'train_station', 'subway_station', 'bus_stop', 'bus_station'];

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { q, bias, region, type } = (await req.json()) as { q?: string; bias?: [number, number]; region?: string; type?: string };
  const kind = type && TYPES.includes(type) ? type : undefined;
  if (!q || q.trim().length < 2) return Response.json({ places: [] });
  try {
    return Response.json({ places: await textSearch(req, q.trim().slice(0, 200), bias, 30000, region && /^[A-Za-z]{2}$/.test(region) ? region : undefined, kind) });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
