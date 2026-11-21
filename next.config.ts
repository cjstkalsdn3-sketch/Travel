import type { NextConfig } from "next";

/** 배포마다 바뀌는 값. 앱이 켜져 있는 동안 새 배포가 나왔는지 비교하는 데 씀 */
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || `local-${Date.now()}`;

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: BUILD },
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
