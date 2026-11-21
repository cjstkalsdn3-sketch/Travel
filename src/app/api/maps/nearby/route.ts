import { SERVER_KEY, NEAR_TYPES, nearbySearch, noKey, type NearKind } from '@/lib/google-server';

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { at, kind } = (await req.json()) as { at?: [number, number]; kind?: string };
  if (!at || !Number.isFinite(at[0]) || !Number.isFinite(at[1]) || !kind || !(kind in NEAR_TYPES)) return new Response('bad request', { status: 400 });
  try {
    return Response.json({ places: await nearbySearch(req, at, kind as NearKind) });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
