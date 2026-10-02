import { Metadata } from 'next';
import { SignupForm } from '@/components/auth/signup-form';

export const metadata: Metadata = {
  title: 'Join Project Nirvana — Choose Your Path',
  description:
    'Create an account to book live healing sessions or offer your services as a verified practitioner.',
};

export default function SignupPage() {
  return <SignupForm />;
}
