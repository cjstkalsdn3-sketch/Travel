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

/**
 * 저장 목록(placelists) 링크: 구글지도 웹이 쓰는 목록 데이터를 읽는다.
 * 공식 API가 아니라 바뀔 수 있어서, 못 읽으면 빈 배열.
 */
async function readList(full: string): Promise<PlaceHit[] | null> {
  const id = full.match(/placelists\/list\/([\w-]+)/)?.[1];
  if (!id) return null;
  const pb = `!1m4!1s${id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
  const r = await fetch(`https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=ko&gl=kr&pb=${encodeURIComponent(pb).replace(/%21/g, '!')}`, {
    headers: { 'user-agent': 'Mozilla/5.0', 'accept-language': 'ko' },
  });
  if (!r.ok) return [];
  const txt = (await r.text()).replace(/^\)\]\}'\s*/, '');
  let data: unknown;
  try {
    data = JSON.parse(txt);
  } catch {
    return [];
  }
  const rows = (data as unknown[][])?.[0]?.[8];
  if (!Array.isArray(rows)) return [];
  const out: PlaceHit[] = [];
  for (const row of rows) {
    // 행 안에서 [_, _, 위도, 경도] 모양과 이름(문자열)을 찾는다
    let ll: [number, number] | null = null;
    const walk = (v: unknown, d: number) => {
      if (ll || d > 6 || !Array.isArray(v)) return;
      if (v.length >= 4 && typeof v[2] === 'number' && typeof v[3] === 'number' && Math.abs(v[2]) <= 90 && Math.abs(v[3]) <= 180 && (v[2] || v[3])) {
        ll = [v[2], v[3]];
        return;
      }
      v.forEach((x) => walk(x, d + 1));
    };
    walk(row, 0);
    const r0 = row as unknown[];
    const name = typeof r0?.[2] === 'string' ? (r0[2] as string) : '';
    const addr = Array.isArray(r0?.[1]) && typeof (r0[1] as unknown[])[4] === 'string' ? ((r0[1] as unknown[])[4] as string) : '';
    if (!name && !ll) continue;
    const [lat, lng] = ll ?? [NaN, NaN];
    out.push({ name: name || addr, addr, lat, lng });
  }
  return out;
}

export async function POST(req: Request) {
  if (!SERVER_KEY) return noKey();
  const { url } = (await req.json()) as { url?: string };
  if (!url || !ALLOWED.test(url.trim())) return new Response('구글지도 링크가 아니에요', { status: 400 });
  try {
    const full = await expand(url.trim());
    const list = await readList(full).catch(() => []);
    if (list) {
      // 좌표 못 읽은 곳은 이름으로 검색해서 채움
      const fixed = await Promise.all(
        list.map(async (h) => {
          if (Number.isFinite(h.lat) && h.name) {
            const hit = (await textSearch(req, h.name, [h.lat, h.lng], 300).catch(() => []))[0];
            return hit ? { ...hit, lat: h.lat, lng: h.lng } : h;
          }
          return (await textSearch(req, h.name).catch(() => []))[0] ?? null;
        }),
      );
      return Response.json({ place: null, list: fixed.filter(Boolean) });
    }
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
