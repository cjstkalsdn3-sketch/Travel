import { connection } from 'next/server';

/** 지금 배포된 버전. 앱은 다시 열릴 때 이걸 자기 버전과 비교해서 다르면 새로고침 */
export async function GET() {
  await connection();
  return Response.json({ v: process.env.NEXT_PUBLIC_BUILD ?? '' }, { headers: { 'cache-control': 'no-store' } });
}
