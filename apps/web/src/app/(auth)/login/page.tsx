import { Suspense } from 'react';
import { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sign In — Project Nirvana',
  description: 'Access your sanctuary account, upcoming healing bookings, and video sessions.',
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
