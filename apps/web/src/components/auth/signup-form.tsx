'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import {
  Sparkles,
  Compass,
  HeartHandshake,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ApiError } from '@/lib/api-client';

export function SignupForm() {
  const router = useRouter();
  const { signup } = useAuth();

  const [role, setRole] = useState<'CONSUMER' | 'PROVIDER'>('CONSUMER');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email address is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters long';
    } else if (
      !/[A-Z]/.test(formData.password) ||
      !/[a-z]/.test(formData.password) ||
      !/[0-9]/.test(formData.password)
    ) {
      newErrors.password = 'Include upper, lowercase letters and at least one number';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (role === 'PROVIDER' && !formData.displayName.trim()) {
      newErrors.displayName = 'Practitioner or sanctuary display name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await signup({
        email: formData.email.trim(),
        password: formData.password,
        name: formData.name.trim(),
        role,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata',
        ...(role === 'PROVIDER'
          ? {
              displayName: formData.displayName.trim(),
              slug: formData.displayName
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)+/g, ''),
            }
          : {}),
      });

      if (role === 'PROVIDER') {
        router.push('/provider/dashboard');
      } else {
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGeneralError(err.message);
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Failed to create account. Please verify your details.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-lg border-border/80 bg-card/95 shadow-xl shadow-stone-900/5">
      <CardHeader className="text-center pb-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <Sparkles className="h-6 w-6" />
        </div>
        <CardTitle className="text-3xl">Begin Your Journey</CardTitle>
        <CardDescription className="text-base text-muted-foreground mt-1">
          Join our sanctuary for holistic health, sacred healing, and mindful transformation.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {generalError && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Role selector: "I want to book" vs "I want to offer services" */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Choose your path</Label>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              role="radiogroup"
              aria-label="Account Type"
            >
              <button
                type="button"
                role="radio"
                aria-checked={role === 'CONSUMER'}
                onClick={() => setRole('CONSUMER')}
                className={`relative flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer ${
                  role === 'CONSUMER'
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-border/70 hover:border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div
                    className={`p-2 rounded-lg ${role === 'CONSUMER' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}
                  >
                    <Compass className="h-4 w-4" />
                  </div>
                  {role === 'CONSUMER' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
                <div className="font-semibold text-sm text-foreground">I want to book</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Explore and book 1-on-1 sessions with verified healers & guides.
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={role === 'PROVIDER'}
                onClick={() => setRole('PROVIDER')}
                className={`relative flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all duration-200 cursor-pointer ${
                  role === 'PROVIDER'
                    ? 'border-primary bg-primary/5 shadow-xs'
                    : 'border-border/70 hover:border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div
                    className={`p-2 rounded-lg ${role === 'PROVIDER' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}
                  >
                    <HeartHandshake className="h-4 w-4" />
                  </div>
                  {role === 'PROVIDER' && <CheckCircle2 className="h-4 w-4 text-primary" />}
                </div>
                <div className="font-semibold text-sm text-foreground">
                  I want to offer services
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Provide healing sessions, manage bookings, and receive escrow payouts.
                </div>
              </button>
            </div>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <Label htmlFor="signup-name" required>
              Your Name
            </Label>
            <Input
              id="signup-name"
              type="text"
              autoComplete="name"
              placeholder="e.g. Maya Sharma"
              value={formData.name}
              error={!!errors.name}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                if (errors.name) setErrors({ ...errors, name: '' });
              }}
            />
            {errors.name && (
              <p id="name-error" role="alert" className="text-xs font-medium text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          {/* Practitioner Display Name (when role is PROVIDER) */}
          {role === 'PROVIDER' && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <Label htmlFor="signup-display-name" required>
                Practitioner / Sanctuary Profile Name
              </Label>
              <Input
                id="signup-display-name"
                type="text"
                placeholder="e.g. Maya Yoga & Pranic Healing"
                value={formData.displayName}
                error={!!errors.displayName}
                aria-invalid={!!errors.displayName}
                aria-describedby={errors.displayName ? 'display-name-error' : undefined}
                onChange={(e) => {
                  setFormData({ ...formData, displayName: e.target.value });
                  if (errors.displayName) setErrors({ ...errors, displayName: '' });
                }}
              />
              {errors.displayName ? (
                <p
                  id="display-name-error"
                  role="alert"
                  className="text-xs font-medium text-destructive"
                >
                  {errors.displayName}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This will be displayed publicly on your practitioner storefront.
                </p>
              )}
            </div>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="signup-email" required>
              Email Address
            </Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              placeholder="you@domain.com"
              value={formData.email}
              error={!!errors.email}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) setErrors({ ...errors, email: '' });
              }}
            />
            {errors.email && (
              <p id="email-error" role="alert" className="text-xs font-medium text-destructive">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="signup-password" required>
              Password
            </Label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••••••"
              value={formData.password}
              error={!!errors.password}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                if (errors.password) setErrors({ ...errors, password: '' });
              }}
            />
            {errors.password && (
              <p id="password-error" role="alert" className="text-xs font-medium text-destructive">
                {errors.password}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              At least 8 characters with upper, lowercase, and numeric characters.
            </p>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <Label htmlFor="signup-confirm-password" required>
              Confirm Password
            </Label>
            <Input
              id="signup-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••••••"
              value={formData.confirmPassword}
              error={!!errors.confirmPassword}
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
              onChange={(e) => {
                setFormData({ ...formData, confirmPassword: e.target.value });
                if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
              }}
            />
            {errors.confirmPassword && (
              <p
                id="confirm-password-error"
                role="alert"
                className="text-xs font-medium text-destructive"
              >
                {errors.confirmPassword}
              </p>
            )}
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating your account...
              </>
            ) : role === 'PROVIDER' ? (
              'Join as Verified Practitioner'
            ) : (
              'Create Seeker Account'
            )}
          </Button>
        </form>

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
          Google Workspace
        </Button>
      </CardContent>

      <CardFooter className="flex flex-col space-y-2 text-center text-sm text-muted-foreground pt-0">
        <div>
          Already registered?{' '}
          <Link
            href="/login"
            className="font-medium text-primary hover:underline underline-offset-4"
          >
            Sign in
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}
