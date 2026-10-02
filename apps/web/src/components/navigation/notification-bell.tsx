'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  Calendar,
  Clock,
  MessageSquare,
  AlertTriangle,
  CreditCard,
  ShieldCheck,
  Settings,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NotificationItem } from '@project-nirvana/shared';

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>(
        '/notifications?limit=8',
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
          body: 'Your sacred sound bath journey with Swami Ananda is confirmed.',
          createdAt: new Date().toISOString(),
          readAt: null,
        },
        {
          id: 'n-mock-2',
          type: 'SESSION_REMINDER_24H',
          title: '24-Hour Reminder',
          body: 'Your appointment begins tomorrow. Run device checks in advance.',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          readAt: null,
        },
      ]);
      setUnreadCount(2);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/notifications/read-all', { method: 'POST' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch (err) {
      console.warn('Failed to mark all read:', err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.readAt) {
      try {
        await apiFetch(`/notifications/${notif.id}/read`, { method: 'POST' });
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
      } catch (err) {
        console.warn('Failed to mark read:', err);
      }
    }
    setIsOpen(false);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'BOOKING_CONFIRMED':
        return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'BOOKING_RESCHEDULED':
        return <Calendar className="h-4 w-4 text-primary" />;
      case 'BOOKING_CANCELLED':
        return <AlertTriangle className="h-4 w-4 text-rose-600" />;
      case 'SESSION_REMINDER_24H':
      case 'SESSION_REMINDER_1H':
        return <Clock className="h-4 w-4 text-amber-600" />;
      case 'CHAT_MESSAGE':
        return <MessageSquare className="h-4 w-4 text-teal-600" />;
      case 'PAYMENT_CAPTURED':
        return <CreditCard className="h-4 w-4 text-emerald-600" />;
      case 'VERIFICATION_STATUS':
        return <ShieldCheck className="h-4 w-4 text-indigo-600" />;
      default:
        return <Bell className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-border/80 bg-background shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
          {/* Header */}
          <div className="p-4 border-b border-border/60 bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-serif font-semibold text-sm text-foreground">Sanctuary Alerts</h3>
              {unreadCount > 0 && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  {unreadCount} new
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Mark all read
                </button>
              )}
              <Link
                href="/notifications"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                title="Preferences"
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Notification List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-border/40">
            {isLoading && notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Checking notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground">No recent alerts</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors hover:bg-muted/30 ${
                    !notif.readAt ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="h-8 w-8 rounded-full bg-muted/50 border border-border/60 flex items-center justify-center shrink-0 mt-0.5">
                    {getIcon(notif.type)}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-foreground line-clamp-1">
                        {notif.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                        {new Date(notif.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {notif.body}
                    </p>
                  </div>
                  {!notif.readAt && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 bg-muted/10 border-t border-border/50 text-center">
            <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
              <Link href="/notifications" onClick={() => setIsOpen(false)}>
                View All Notifications & Preferences
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
