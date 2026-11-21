import { SERVER_KEY, noKey, textSearch, type PlaceHit } from '@/lib/google-server';

const ALLOWED = /^https:\/\/(maps\.app\.goo\.gl|goo\.gl|(www\.)?google\.[a-z.]+|maps\.google\.[a-z.]+)\//i;

/** 짧은 링크를 끝까지 따라가 실제 구글지도 주소를 얻는다 (구글 주소만 따라감) */
async function expand(url: string): Promise<string> {
  let cur = url;
  for (let i = 0; i < 6; i++) {
    if (!ALLOWED.test(cur)) break;
    const r = await fetch(cur, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0' } });
    const loc = r.headers.get('location');
    if (!loc || r.status < 300 || r.status >= 400) break;
    cur = new URL(loc, cur).toString();
  }
  return cur;
}

const dec = (s: string) => {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
};

/** 주소에서 이름과 좌표 뽑기 */
function parse(u: string): { name?: string; lat?: number; lng?: number } {
  const out: { name?: string; lat?: number; lng?: number } = {};
  const m3 = u.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const mAt = u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const c = m3 ?? mAt;
  if (c) {
    out.lat = Number(c[1]);
    out.lng = Number(c[2]);
  }
  const mPlace = u.match(/\/maps\/(?:place|search)\/([^/@?]+)/);
  if (mPlace) out.name = dec(mPlace[1]);
  try {
    const q = new URL(u).searchParams.get('q') ?? new URL(u).searchParams.get('query');
    if (q) {
      const ll = q.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
      if (ll) {
        out.lat ??= Number(ll[1]);
        out.lng ??= Number(ll[2]);
      } else out.name ??= dec(q);
    }
  } catch {}
  return out;
}

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { url } = (await req.json()) as { url?: string };
  if (!url || !ALLOWED.test(url.trim())) return new Response('구글지도 링크가 아니에요', { status: 400 });
  try {
    const full = await expand(url.trim());
    const p = parse(full);
    let place: PlaceHit | null = null;
    if (p.name) {
      const hits = await textSearch(req, p.name, p.lat !== undefined ? [p.lat, p.lng!] : undefined, 500);
      place = hits[0] ?? null;
      if (place && p.lat !== undefined) {
        // 링크의 좌표가 더 정확하다
        place = { ...place, lat: p.lat, lng: p.lng! };
      }
    }
    if (!place && p.lat !== undefined) place = { name: p.name ?? '', addr: '', lat: p.lat, lng: p.lng! };
    return Response.json({ place });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
