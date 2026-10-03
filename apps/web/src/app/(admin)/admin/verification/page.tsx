import type { Metadata } from 'next';
import { VerificationQueue } from '@/components/admin/verification-queue';

export const metadata: Metadata = {
  title: 'Practitioner Verification Queue | Project Nirvana Ops',
  description:
    'Review pending healer credential dossiers, assign verification tiers, and approve sanctuary access.',
};

export default function AdminVerificationPage() {
  return (
    <div className="space-y-6">
      <VerificationQueue />
    </div>
  );
}
