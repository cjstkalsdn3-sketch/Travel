import { SERVER_KEY, autocomplete, noKey } from '@/lib/google-server';

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { q, bias, region, session } = (await req.json()) as { q?: string; bias?: [number, number]; region?: string; session?: string };
  if (!q || q.trim().length < 1 || !bias || !region || !/^[A-Za-z]{2}$/.test(region)) return Response.json({ list: [] });
  try {
    return Response.json({ list: await autocomplete(req, q.trim().slice(0, 100), bias, region, session?.slice(0, 64)) });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
