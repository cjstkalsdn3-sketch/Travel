import { Suspense } from 'react';
import { ShareInbox } from '@/components/ShareInbox';

export default function Page() {
  return (
    <Suspense fallback={<main className="shell" />}>
      <ShareInbox />
    </Suspense>
  );
}
