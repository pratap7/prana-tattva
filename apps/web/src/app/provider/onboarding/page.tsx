import type { Metadata } from 'next';
import { OnboardingWizard } from '@/components/provider/onboarding/onboarding-wizard';

export const metadata: Metadata = {
  title: 'Practitioner Onboarding & Verification | Project Nirvana',
  description:
    'Complete your healer profile, upload credentials, setup escrow payouts, and submit your application for verification.',
};

export default function ProviderOnboardingPage() {
  return (
    <div className="min-h-screen bg-background py-10 px-4 sm:px-6 lg:px-8">
      <OnboardingWizard />
    </div>
  );
}
