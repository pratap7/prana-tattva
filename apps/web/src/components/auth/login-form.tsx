'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Sparkles, Phone, Mail, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { ApiError } from '@/lib/api-client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const { login, requestPhoneOtp, verifyPhoneOtp } = useAuth();

  const [authMethod, setAuthMethod] = useState<'password' | 'otp'>('password');

  // Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // OTP state
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    const newErrors: Record<string, string> = {};

    if (!email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      router.push(returnUrl || '/dashboard');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGeneralError(err.message);
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Invalid email or password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!phone.trim() || phone.trim().length < 10) {
      setErrors({ phone: 'Please enter a valid 10+ digit mobile number with country code' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await requestPhoneOtp(phone.trim());
      setOtpSent(true);
      setOtpCountdown(res.expiresInSeconds || 300);
      setErrors({});
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Could not send OTP code. Please check the phone number.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setErrors({ otp: 'Please enter the 6-digit code received via SMS' });
      return;
    }

    setIsSubmitting(true);
    try {
      await verifyPhoneOtp(phone.trim(), otpCode.trim());
      router.push(returnUrl || '/dashboard');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Invalid or expired OTP code.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-xl shadow-stone-900/5">
      <CardHeader className="text-center pb-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <Sparkles className="h-6 w-6" />
        </div>
        <CardTitle className="text-3xl">Welcome Back</CardTitle>
        <CardDescription className="text-base text-muted-foreground mt-1">
          Enter your sanctuary credentials to access your live healing sessions.
        </CardDescription>

        {/* Method switcher */}
        <div className="mt-4 flex rounded-lg bg-muted/60 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('password');
              setGeneralError(null);
            }}
            className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all ${
              authMethod === 'password'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Email & Password
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('otp');
              setGeneralError(null);
            }}
            className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all ${
              authMethod === 'otp'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Phone className="h-3.5 w-3.5 mr-1.5" />
            Phone OTP
          </button>
        </div>
      </CardHeader>

      <CardContent>
        {generalError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{generalError}</span>
          </div>
        )}

        {authMethod === 'password' ? (
          <form onSubmit={handlePasswordSubmit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email" required>
                Email Address
              </Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@domain.com"
                value={email}
                error={!!errors.email}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-login-error' : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: '' });
                }}
              />
              {errors.email && (
                <p
                  id="email-login-error"
                  role="alert"
                  className="text-xs font-medium text-destructive"
                >
                  {errors.email}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password" required>
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline underline-offset-4"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••••"
                value={password}
                error={!!errors.password}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-login-error' : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: '' });
                }}
              />
              {errors.password && (
                <p
                  id="password-login-error"
                  role="alert"
                  className="text-xs font-medium text-destructive"
                >
                  {errors.password}
                </p>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-phone" required>
                    Mobile Phone Number
                  </Label>
                  <Input
                    id="login-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+91 98765 43210"
                    value={phone}
                    error={!!errors.phone}
                    aria-invalid={!!errors.phone}
                    aria-describedby={errors.phone ? 'phone-error' : undefined}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (errors.phone) setErrors({ ...errors, phone: '' });
                    }}
                  />
                  {errors.phone && (
                    <p
                      id="phone-error"
                      role="alert"
                      className="text-xs font-medium text-destructive"
                    >
                      {errors.phone}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    We will send a 6-digit verification code via SMS (MSG91/Twilio).
                  </p>
                </div>

                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending code...
                    </>
                  ) : (
                    <>
                      Send One-Time Passcode
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-otp" required>
                      Enter 6-Digit Code
                    </Label>
                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="text-xs text-primary hover:underline"
                    >
                      Change number
                    </button>
                  </div>
                  <Input
                    id="login-otp"
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    className="text-center font-mono tracking-widest text-lg"
                    value={otpCode}
                    error={!!errors.otp}
                    aria-invalid={!!errors.otp}
                    aria-describedby={errors.otp ? 'otp-error' : undefined}
                    onChange={(e) => {
                      setOtpCode(e.target.value);
                      if (errors.otp) setErrors({ ...errors, otp: '' });
                    }}
                  />
                  {errors.otp && (
                    <p id="otp-error" role="alert" className="text-xs font-medium text-destructive">
                      {errors.otp}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Sent to {phone}. Code expires in {otpCountdown}s.
                  </p>
                </div>

                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying code...
                    </>
                  ) : (
                    'Verify & Sign In'
                  )}
                </Button>
              </form>
            )}
          </div>
        )}

        <div className="relative my-6 text-center text-xs">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <span className="relative bg-card px-2 text-muted-foreground uppercase tracking-wider">
            Or continue with
          </span>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            window.location.href = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/auth/google`;
          }}
        >
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              fill="#EA4335"
            />
          </svg>
          Google Account
        </Button>
      </CardContent>

      <CardFooter className="flex flex-col space-y-2 text-center text-sm text-muted-foreground pt-0">
        <div>
          New to Project Nirvana?{' '}
          <Link
            href="/signup"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            Create an account
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
