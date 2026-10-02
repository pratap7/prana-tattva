'use client';

import React, { useState, useEffect } from 'react';
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
import { CheckCircle2, AlertCircle, Loader2, MailCheck } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/api-client';

export function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const performVerification = async (verifyToken: string) => {
    if (!verifyToken.trim()) {
      setStatus('error');
      setMessage('A verification token is required.');
      return;
    }

    setStatus('verifying');
    setMessage(null);

    try {
      const res = await apiFetch<{ success: boolean; message: string }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken.trim() }),
      });
      setStatus('success');
      setMessage(res.message || 'Your email address has been successfully verified.');
    } catch (err: unknown) {
      setStatus('error');
      if (err instanceof ApiError) {
        setMessage(err.message);
      } else {
        setMessage('Invalid or expired verification token. Please request a new one.');
      }
    }
  };

  useEffect(() => {
    if (tokenFromUrl) {
      performVerification(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-xl shadow-stone-900/5">
      <CardHeader className="text-center pb-6">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-3">
          <MailCheck className="h-6 w-6" />
        </div>
        <CardTitle className="text-3xl">Email Verification</CardTitle>
        <CardDescription className="text-base text-muted-foreground mt-1">
          Confirm your email to complete your registration and unlock full booking capabilities.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {status === 'verifying' && (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">
              Verifying your email address with the sanctuary...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="py-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h4 className="font-semibold text-lg text-foreground">Email Confirmed</h4>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
            <Button size="lg" className="w-full" asChild>
              <Link href="/login">Continue to Sign In</Link>
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <span>{message}</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                performVerification(token);
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="manual-token">Or enter your verification code manually:</Label>
                <Input
                  id="manual-token"
                  placeholder="Paste verification token here"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full">
                Verify Token
              </Button>
            </form>
          </div>
        )}

        {status === 'idle' && !tokenFromUrl && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              performVerification(token);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="idle-token" required>
                Verification Token
              </Label>
              <Input
                id="idle-token"
                placeholder="Paste code from verification email"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Verify Email
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
