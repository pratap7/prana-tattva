import { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot Password — Project Nirvana',
  description: 'Request a secure email link to reset your account password.',
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
