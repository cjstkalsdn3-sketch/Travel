import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '우리 여행',
    short_name: '우리 여행',
    description: '둘이 함께 쓰는 해외여행 일정·예산 앱',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAFBFD',
    theme_color: '#FAFBFD',
    lang: 'ko',
    // 구글지도 "공유" 목록에 우리 여행이 뜨게 (설치한 앱에서만)
    share_target: { action: '/share', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
