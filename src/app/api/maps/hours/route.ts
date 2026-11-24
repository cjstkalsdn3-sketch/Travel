import { SERVER_KEY, hoursById, noKey } from '@/lib/google-server';

/** 담아둔 곳들의 영업시간 (한 번에 30곳까지) */
export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { ids } = (await req.json()) as { ids?: string[] };
  if (!Array.isArray(ids) || !ids.length || ids.length > 30 || !ids.every((id) => typeof id === 'string' && /^[\w-]{10,300}$/.test(id)))
    return new Response('bad request', { status: 400 });
  const out: Record<string, [number, number, number][] | null> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        out[id] = await hoursById(req, id);
      } catch {
        /* 하나 실패해도 나머지는 */
      }
    }),
  );
  return Response.json({ hours: out });
}
