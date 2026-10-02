'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { LockKeyhole, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!token.trim()) {
      newErrors.token = 'Reset token is required';
    }

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      newErrors.password = 'Must include upper, lowercase letters and a number';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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
      await apiFetch<{ success: boolean; message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: token.trim(),
          password,
        }),
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Failed to reset password. The link may have expired.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-xl shadow-stone-900/5">
      <CardHeader className="text-center pb-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <CardTitle className="text-3xl">Set New Password</CardTitle>
        <CardDescription className="text-base text-muted-foreground mt-1">
          Choose a secure, resilient password for your Nirvana account.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isSuccess ? (
          <div className="py-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-lg text-foreground">Password Reset Successfully</h4>
              <p className="text-sm text-muted-foreground">
                Your password has been securely updated. You can now sign in with your new
                credentials.
              </p>
            </div>
            <Button size="lg" className="w-full" asChild>
              <Link href="/login">Sign in with New Password</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {generalError && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
              >
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{generalError}</span>
              </div>
            )}

            {!tokenFromUrl && (
              <div className="space-y-1.5">
                <Label htmlFor="reset-token" required>
                  Reset Token
                </Label>
                <Input
                  id="reset-token"
                  placeholder="Paste token received in email"
                  value={token}
                  error={!!errors.token}
                  aria-invalid={!!errors.token}
                  aria-describedby={errors.token ? 'token-error' : undefined}
                  onChange={(e) => {
                    setToken(e.target.value);
                    if (errors.token) setErrors({ ...errors, token: '' });
                  }}
                />
                {errors.token && (
                  <p id="token-error" role="alert" className="text-xs font-medium text-destructive">
                    {errors.token}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="new-password" required>
                New Password
              </Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••••••"
                value={password}
                error={!!errors.password}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'new-password-error' : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors({ ...errors, password: '' });
                }}
              />
              {errors.password && (
                <p
                  id="new-password-error"
                  role="alert"
                  className="text-xs font-medium text-destructive"
                >
                  {errors.password}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirm-new-password" required>
                Confirm New Password
              </Label>
              <Input
                id="confirm-new-password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••••••"
                value={confirmPassword}
                error={!!errors.confirmPassword}
                aria-invalid={!!errors.confirmPassword}
                aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
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
                  Updating password...
                </>
              ) : (
                'Save New Password'
              )}
            </Button>
          </form>
        )}
      </CardContent>

      <CardFooter className="flex justify-center text-sm text-muted-foreground pt-0">
        <Link href="/login" className="hover:underline">
          Return to Sign In
        </Link>
      </CardFooter>
    </Card>
  );
}
