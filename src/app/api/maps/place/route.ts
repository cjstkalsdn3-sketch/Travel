import { SERVER_KEY, noKey, placeById } from '@/lib/google-server';

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { id, session } = (await req.json()) as { id?: string; session?: string };
  if (!id || !/^[\w-]{10,300}$/.test(id)) return new Response('bad request', { status: 400 });
  try {
    return Response.json({ place: await placeById(req, id, session?.slice(0, 64)) });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
