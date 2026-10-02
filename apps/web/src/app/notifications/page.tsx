'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Bell,
  Calendar,
  Clock,
  MessageSquare,
  AlertTriangle,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Sliders,
  Mail,
  Smartphone,
  Globe,
  Loader2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';
import { apiFetch } from '@/lib/api-client';
import { NotificationItem, NotificationPreferenceItem } from '@project-nirvana/shared';

function NotificationsContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'preferences' ? 'preferences' : 'feed';

  const [activeTab, setActiveTab] = useState<'feed' | 'preferences'>(initialTab);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'SESSIONS' | 'PAYMENTS'>('ALL');

  // Notifications Feed State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoadingFeed, setIsLoadingFeed] = useState<boolean>(true);

  // Preference Center State
  const [preferences, setPreferences] = useState<NotificationPreferenceItem[]>([]);
  const [isLoadingPrefs, setIsLoadingPrefs] = useState<boolean>(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Push Permission State
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'denied' | 'unsupported'>(
    'default',
  );
  const [isRegisteringPush, setIsRegisteringPush] = useState<boolean>(false);

  // 1. Check Web Push support & permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushStatus(Notification.permission);
    } else {
      setPushStatus('unsupported');
    }
  }, []);

  // 2. Fetch notifications feed
  const fetchFeed = useCallback(async () => {
    try {
      setIsLoadingFeed(true);
      const res = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>(
        '/notifications?limit=50',
      );
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch {
      // Mock notifications for offline preview
      setNotifications([
        {
          id: 'n-mock-1',
          type: 'BOOKING_CONFIRMED',
          title: 'Session Confirmed',
          body: 'Your sacred sound bath journey with Swami Ananda is confirmed for tomorrow.',
          createdAt: new Date().toISOString(),
          readAt: null,
        },
        {
          id: 'n-mock-2',
          type: 'SESSION_REMINDER_24H',
          title: '24-Hour Reminder',
          body: 'Your appointment begins in 24 hours. Run pre-join checks in advance.',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          readAt: null,
        },
        {
          id: 'n-mock-3',
          type: 'PAYMENT_CAPTURED',
          title: 'Payment Successful',
          body: 'Payment of ₹2,500 has been secured in escrow for Booking #BKG-882.',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          readAt: new Date(Date.now() - 80000000).toISOString(),
        },
      ]);
      setUnreadCount(2);
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  // 3. Fetch Preferences
  const fetchPreferences = useCallback(async () => {
    try {
      setIsLoadingPrefs(true);
      const res = await apiFetch<{ preferences: NotificationPreferenceItem[] }>(
        '/notifications/preferences',
      );
      setPreferences(res.preferences || []);
    } catch {
      // Fallback defaults
      setPreferences([
        {
          type: 'BOOKING_CONFIRMED',
          label: 'Booking Confirmed',
          description: 'Notified when an appointment is booked and locked.',
          inApp: true,
          email: true,
          sms: true,
          push: true,
        },
        {
          type: 'SESSION_REMINDER_24H',
          label: '24-Hour Reminder',
          description: 'A thoughtful reminder sent one day prior to start.',
          inApp: true,
          email: true,
          sms: false,
          push: true,
        },
        {
          type: 'SESSION_REMINDER_1H',
          label: '1-Hour Reminder',
          description: 'Urgent reminder with pre-join check instructions.',
          inApp: true,
          email: true,
          sms: true,
          push: true,
        },
        {
          type: 'CHAT_MESSAGE',
          label: 'Direct Messages',
          description: 'When your guide or client sends you a new message.',
          inApp: true,
          email: false,
          sms: false,
          push: true,
        },
        {
          type: 'PAYMENT_CAPTURED',
          label: 'Payment & Receipts',
          description: 'Receipts, transfers, escrow releases, and refunds.',
          inApp: true,
          email: true,
          sms: false,
          push: true,
        },
        {
          type: 'REVIEW_REQUEST',
          label: 'Post-Session Reflection',
          description: 'Opportunity to share gratitude and review your guide.',
          inApp: true,
          email: true,
          sms: false,
          push: false,
        },
      ]);
    } finally {
      setIsLoadingPrefs(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchFeed();
      fetchPreferences();
    }
  }, [isAuthenticated, fetchFeed, fetchPreferences]);

  // Actions
  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch (err) {
      console.warn('Failed to mark all read:', err);
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
      setUnreadCount((c) => Math.max(0, c - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
    } catch (err) {
      console.warn('Failed to mark read:', err);
    }
  };

  const handleTogglePref = (type: string, channel: 'inApp' | 'email' | 'sms' | 'push') => {
    setPreferences((prev) =>
      prev.map((pref) => {
        if (pref.type === type) {
          return { ...pref, [channel]: !pref[channel] };
        }
        return pref;
      }),
    );
  };

  const handleSavePreferences = async () => {
    try {
      setIsSavingPrefs(true);
      await apiFetch('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          preferences: preferences.map((p) => ({
            type: p.type,
            inApp: p.inApp,
            email: p.email,
            sms: p.sms,
            push: p.push,
          })),
        }),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save preferences';
      alert(msg);
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const handleEnablePush = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support push notifications.');
      return;
    }

    try {
      setIsRegisteringPush(true);
      const permission = await Notification.requestPermission();
      setPushStatus(permission);

      if (permission === 'granted') {
        // Register mock/web push subscription
        await apiFetch('/notifications/push-subscription', {
          method: 'POST',
          body: JSON.stringify({
            endpoint: `https://fcm.googleapis.com/fcm/send/mock-${Date.now()}`,
            keys: {
              p256dh: 'BNcRdreALRF86x7fv...',
              auth: 'tBH275kE72gJ9...',
            },
          }),
        });
      }
    } catch (err: unknown) {
      console.warn('Push registration:', err);
    } finally {
      setIsRegisteringPush(false);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'BOOKING_CONFIRMED':
      case 'BOOKING_RESCHEDULED':
        return <Calendar className="h-4 w-4 text-emerald-500" />;
      case 'SESSION_REMINDER_24H':
      case 'SESSION_REMINDER_1H':
        return <Clock className="h-4 w-4 text-sky-500" />;
      case 'CHAT_MESSAGE':
        return <MessageSquare className="h-4 w-4 text-indigo-500" />;
      case 'BOOKING_CANCELLED':
      case 'PAYMENT_FAILED':
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'PAYMENT_CAPTURED':
        return <CreditCard className="h-4 w-4 text-amber-500" />;
      case 'VERIFICATION_STATUS':
        return <ShieldCheck className="h-4 w-4 text-primary" />;
      default:
        return <Bell className="h-4 w-4 text-primary" />;
    }
  };

  if (isAuthLoading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="container mx-auto px-4 py-20 max-w-lg text-center space-y-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mx-auto">
          <Bell className="h-8 w-8" />
        </div>
        <h2 className="font-serif text-2xl font-medium text-foreground">
          Sign In for Notification Feed
        </h2>
        <p className="text-sm text-muted-foreground">
          Track session updates, appointment reminders, and customize your delivery channels.
        </p>
        <Button asChild className="mt-2">
          <a href="/login?redirect=/notifications">Sign In</a>
        </Button>
      </div>
    );
  }

  const filteredFeed = notifications.filter((item) => {
    if (filter === 'UNREAD') return !item.readAt;
    if (filter === 'SESSIONS')
      return (
        item.type.includes('BOOKING') ||
        item.type.includes('SESSION') ||
        item.type.includes('REVIEW')
      );
    if (filter === 'PAYMENTS') return item.type.includes('PAYMENT');
    return true;
  });

  return (
    <div className="container mx-auto px-4 sm:px-8 py-8 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="font-serif text-3xl font-medium text-foreground">
            Sanctuary Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stay mindfully informed on upcoming sessions, messages, and account activity.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex rounded-xl bg-muted/60 p-1 border border-border/80 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'feed'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Bell className="h-4 w-4" />
            <span>Alerts Feed</span>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">
                {unreadCount}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab('preferences')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'preferences'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Preference Center</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ALERTS FEED */}
      {activeTab === 'feed' && (
        <div className="space-y-6">
          {/* Feed Filter & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/80 pb-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              {(['ALL', 'UNREAD', 'SESSIONS', 'PAYMENTS'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilter(cat)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors capitalize ${
                    filter === cat
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat.toLowerCase()}
                </button>
              ))}
            </div>

            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                className="text-xs self-end sm:self-auto"
              >
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Mark all as read
              </Button>
            )}
          </div>

          {/* Notifications List */}
          {isLoadingFeed ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredFeed.length === 0 ? (
            <div className="py-20 text-center space-y-3 bg-card/40 rounded-2xl border border-dashed border-border/80">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground/40 mx-auto" />
              <h3 className="font-serif text-base font-medium text-foreground">All caught up</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {filter === 'UNREAD'
                  ? 'You have zero unread notifications. Enjoy the stillness.'
                  : 'No notification records match this filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredFeed.map((item) => (
                <div
                  key={item.id}
                  onClick={() => !item.readAt && handleMarkSingleRead(item.id)}
                  className={`p-4 rounded-2xl border transition-all duration-200 flex items-start gap-4 cursor-pointer ${
                    !item.readAt
                      ? 'bg-primary/5 border-primary/20 shadow-sm'
                      : 'bg-card/70 border-border/70 hover:bg-muted/30'
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-muted/60 border border-border/70 flex items-center justify-center shrink-0 mt-0.5">
                    {getIcon(item.type)}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                        {!item.readAt && (
                          <Badge
                            variant="default"
                            className="text-[9px] px-1.5 py-0 h-4 bg-primary"
                          >
                            New
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(item.createdAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PREFERENCE CENTER MATRIX */}
      {activeTab === 'preferences' && (
        <div className="space-y-8">
          {/* Push Permission Card */}
          <div className="p-6 rounded-2xl border border-border bg-card/60 backdrop-blur-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <h3 className="font-serif text-base font-medium text-foreground">
                  Browser Push Notifications
                </h3>
                <Badge
                  variant={
                    pushStatus === 'granted'
                      ? 'success'
                      : pushStatus === 'denied'
                        ? 'destructive'
                        : 'outline'
                  }
                  className="text-xs"
                >
                  {pushStatus === 'granted'
                    ? 'Active'
                    : pushStatus === 'denied'
                      ? 'Blocked by Browser'
                      : 'Not Enabled'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                Receive instant alerts 1 hour before scheduled consultations, or whenever your
                practitioner sends you a message, even when the tab is closed.
              </p>
            </div>

            {pushStatus !== 'granted' && pushStatus !== 'unsupported' && (
              <Button
                size="sm"
                onClick={handleEnablePush}
                disabled={isRegisteringPush}
                className="shrink-0"
              >
                {isRegisteringPush ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Bell className="h-4 w-4 mr-1.5" />
                )}
                Enable Web Push
              </Button>
            )}
          </div>

          {/* Preferences Table Matrix */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/20">
              <div>
                <h3 className="font-serif text-lg font-medium text-foreground">
                  Multi-Channel Notification Matrix
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tune each event to your preferred channels. Critical security events and invoices
                  are delivered via email by default.
                </p>
              </div>

              <Button
                size="sm"
                onClick={handleSavePreferences}
                disabled={isSavingPrefs}
                className="self-end sm:self-auto"
              >
                {isSavingPrefs ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : saveSuccess ? (
                  <Check className="h-4 w-4 mr-1.5 text-emerald-300" />
                ) : null}
                {saveSuccess ? 'Preferences Saved' : 'Save Preferences'}
              </Button>
            </div>

            {isLoadingPrefs ? (
              <div className="py-20 flex justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border/80 text-muted-foreground">
                    <tr>
                      <th className="py-3 px-6 font-medium">Notification Event</th>
                      <th className="py-3 px-4 font-medium text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Bell className="h-3.5 w-3.5" />
                          <span>In-App</span>
                        </div>
                      </th>
                      <th className="py-3 px-4 font-medium text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          <span>Email</span>
                        </div>
                      </th>
                      <th className="py-3 px-4 font-medium text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Smartphone className="h-3.5 w-3.5" />
                          <span>SMS</span>
                        </div>
                      </th>
                      <th className="py-3 px-4 font-medium text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Globe className="h-3.5 w-3.5" />
                          <span>Push</span>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {preferences.map((pref) => (
                      <tr key={pref.type} className="hover:bg-muted/20 transition-colors">
                        <td className="py-4 px-6 max-w-sm">
                          <p className="font-semibold text-foreground text-xs">{pref.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                            {pref.description}
                          </p>
                        </td>

                        {/* In-App Toggle */}
                        <td className="py-4 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={pref.inApp}
                            onChange={() => handleTogglePref(pref.type, 'inApp')}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                          />
                        </td>

                        {/* Email Toggle */}
                        <td className="py-4 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={pref.email}
                            onChange={() => handleTogglePref(pref.type, 'email')}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                          />
                        </td>

                        {/* SMS Toggle */}
                        <td className="py-4 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={pref.sms}
                            onChange={() => handleTogglePref(pref.type, 'sms')}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                          />
                        </td>

                        {/* Web Push Toggle */}
                        <td className="py-4 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={pref.push}
                            onChange={() => handleTogglePref(pref.type, 'push')}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <NotificationsContent />
    </Suspense>
  );
}
