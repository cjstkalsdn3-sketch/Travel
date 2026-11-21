import { SERVER_KEY, noKey, textSearch } from '@/lib/google-server';

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { q, bias } = (await req.json()) as { q?: string; bias?: [number, number] };
  if (!q || q.trim().length < 2) return Response.json({ places: [] });
  try {
    return Response.json({ places: await textSearch(req, q.trim().slice(0, 200), bias) });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
