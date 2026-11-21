import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans_KR, Space_Grotesk } from 'next/font/google';
import { UIProvider } from '@/components/ui';
import { Gate } from '@/components/Gate';
import './globals.css';

const plex = IBM_Plex_Sans_KR({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-plex', display: 'swap', preload: false });
const grotesk = Space_Grotesk({ weight: ['500', '600', '700'], subsets: ['latin'], variable: '--font-grotesk', display: 'swap' });

export const metadata: Metadata = {
  title: '우리 여행',
  description: '둘이 함께 쓰는 해외여행 일정·예산 앱',
  appleWebApp: { capable: true, title: '우리 여행', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F4F8' },
    { media: '(prefers-color-scheme: dark)', color: '#0D121A' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${plex.variable} ${grotesk.variable}`}>
      <body>
        <UIProvider>
          <Gate>{children}</Gate>
        </UIProvider>
      </body>
    </html>
  );
}
