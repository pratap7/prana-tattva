'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
import { KeyRound, CheckCircle2, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please provide your registered email address.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiFetch<{ success: boolean; message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to send password reset email. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-xl shadow-stone-900/5">
      <CardHeader className="text-center pb-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <KeyRound className="h-6 w-6" />
        </div>
        <CardTitle className="text-3xl">Reset Password</CardTitle>
        <CardDescription className="text-base text-muted-foreground mt-1">
          Enter your email address and we will send you a secure link to reset your account
          password.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {isSuccess ? (
          <div className="py-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-lg text-foreground">Instructions Sent</h4>
              <p className="text-sm text-muted-foreground">
                If an account exists for{' '}
                <span className="font-medium text-foreground">{email}</span>, you will receive
                password reset instructions shortly.
              </p>
            </div>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/login">Return to Sign In</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
              >
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="forgot-email" required>
                Email Address
              </Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="email"
                placeholder="you@domain.com"
                value={email}
                error={!!error}
                aria-invalid={!!error}
                aria-describedby={error ? 'forgot-email-error' : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
              />
              {error && (
                <p
                  id="forgot-email-error"
                  role="alert"
                  className="text-xs font-medium text-destructive"
                >
                  {error}
                </p>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending link...
                </>
              ) : (
                'Send Password Reset Link'
              )}
            </Button>
          </form>
        )}
      </CardContent>

      <CardFooter className="flex justify-center text-sm text-muted-foreground pt-0">
        <Link href="/login" className="flex items-center text-primary hover:underline">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
          Back to login
        </Link>
      </CardFooter>
    </Card>
  );
}
