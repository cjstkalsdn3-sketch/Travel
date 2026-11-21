import { SERVER_KEY, noKey, textSearch } from '@/lib/google-server';

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { q, bias, region } = (await req.json()) as { q?: string; bias?: [number, number]; region?: string };
  if (!q || q.trim().length < 2) return Response.json({ places: [] });
  try {
    return Response.json({ places: await textSearch(req, q.trim().slice(0, 200), bias, 30000, region && /^[A-Za-z]{2}$/.test(region) ? region : undefined) });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
