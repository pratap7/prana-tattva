import { Suspense } from 'react';
import { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Reset Password — Project Nirvana',
  description: 'Enter and confirm your new secure password.',
};

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
