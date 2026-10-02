import { Suspense } from 'react';
import { Metadata } from 'next';
import { VerifyEmailForm } from '@/components/auth/verify-email-form';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Verify Your Email — Project Nirvana',
  description: 'Confirm your email address to activate your holistic wellness account.',
};

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  );
}
