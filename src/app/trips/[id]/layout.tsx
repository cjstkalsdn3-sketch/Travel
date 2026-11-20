import { Suspense } from 'react';
import { TripShell } from '@/components/TripShell';

export default function TripLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<main className="shell" />}>
      <TripShell>{children}</TripShell>
    </Suspense>
  );
}
