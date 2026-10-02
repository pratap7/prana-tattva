import type { Metadata } from 'next';
import { VerificationQueue } from '@/components/admin/verification-queue';

export const metadata: Metadata = {
  title: 'Practitioner Verification Queue | Project Nirvana Ops',
  description:
    'Review pending healer credential dossiers, assign verification tiers, and approve sanctuary access.',
};

export default function AdminVerificationPage() {
  return (
    <div className="container mx-auto py-10 px-4 sm:px-8 max-w-7xl">
      <VerificationQueue />
    </div>
  );
}
