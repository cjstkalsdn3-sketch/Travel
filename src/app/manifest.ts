import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '우리 여행',
    short_name: '우리 여행',
    description: '둘이 함께 쓰는 해외여행 일정·예산 앱',
    start_url: '/',
    display: 'standalone',
    background_color: '#F2F4F8',
    theme_color: '#2A57DE',
    lang: 'ko',
  };
}
