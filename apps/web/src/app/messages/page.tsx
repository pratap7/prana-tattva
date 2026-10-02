'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, Search, Lock, Sparkles, Loader2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';
import { apiFetch } from '@/lib/api-client';
import { ChatWindow } from '@/components/messaging/chat-window';
import { ConversationSummary } from '@project-nirvana/shared';

function MessagesContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const searchParams = useSearchParams();
  const initialConvId = searchParams.get('conversationId');

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConvId);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showMobileChat, setShowMobileChat] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<{ conversations: ConversationSummary[] }>('/conversations');
      const list = res.conversations || [];
      setConversations(list);

      // Auto select if not selected
      if (!activeConversationId && list.length > 0) {
        setActiveConversationId(list[0].id);
      }
    } catch (err) {
      console.warn('Failed to load conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeConversationId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
    }
  }, [isAuthenticated, fetchConversations]);

  useEffect(() => {
    if (initialConvId) {
      setActiveConversationId(initialConvId);
      setShowMobileChat(true);
    }
  }, [initialConvId]);

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
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="font-serif text-2xl font-medium text-foreground">
          Sign In to Access Messages
        </h2>
        <p className="text-sm text-muted-foreground">
          Your sacred communications with practitioners are strictly confidential and encrypted at
          rest.
        </p>
        <Button asChild className="mt-2">
          <a href="/login?redirect=/messages">Sign In</a>
        </Button>
      </div>
    );
  }

  const filteredConversations = conversations.filter((conv) => {
    return conv.partner.displayName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const activeConversation = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="container mx-auto px-4 sm:px-8 py-6 h-[calc(100vh-5rem)] min-h-[600px] flex flex-col">
      {/* Top Banner / Breadcrumb */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="font-serif text-2xl font-medium text-foreground flex items-center gap-2">
            <span>Sacred Dialogue</span>
            <Badge variant="outline" className="text-xs font-normal border-primary/30 text-primary">
              <Lock className="h-3 w-3 mr-1" />
              AES-256 Encrypted
            </Badge>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time, private correspondence between seekers and verified guides.
          </p>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-sm shadow-xl p-2 sm:p-4">
        {/* Left Sidebar: Conversations List */}
        <div
          className={`md:col-span-4 lg:col-span-4 flex flex-col h-full border-r border-border/80 pr-0 md:pr-4 ${
            showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Search box */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-muted/50 border border-border/70 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
            />
          </div>

          {/* Conversations scroll area */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {isLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="py-12 text-center space-y-3 px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                <p className="text-xs text-muted-foreground">
                  {searchQuery
                    ? 'No conversations found matching your search.'
                    : 'No conversations yet. Explore verified practitioners to initiate a consultation.'}
                </p>
                {!searchQuery && (
                  <Button variant="outline" size="sm" asChild className="text-xs">
                    <a href="/explore">Explore Sanctuary</a>
                  </Button>
                )}
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const other = conv.partner;
                const isSelected = conv.id === activeConversationId;

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setActiveConversationId(conv.id);
                      setShowMobileChat(true);
                    }}
                    className={`p-3 rounded-xl cursor-pointer transition-all duration-150 flex items-start gap-3 ${
                      isSelected
                        ? 'bg-primary/10 border border-primary/20 shadow-sm'
                        : 'hover:bg-muted/40 border border-transparent'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-serif text-primary font-medium text-sm">
                        {other.displayName.charAt(0)}
                      </div>
                      {conv.isUnlocked ? (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-card"
                          title="Booking Confirmed"
                        />
                      ) : (
                        <span
                          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-500 border-2 border-card"
                          title="Pre-Booking Enquiry"
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {other.displayName}
                        </p>
                        {conv.lastMessage?.createdAt && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {new Date(conv.lastMessage.createdAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-1">
                        <p className="text-[11px] text-muted-foreground truncate">
                          {conv.lastMessage?.content || 'Conversation open'}
                        </p>
                        {!conv.isUnlocked && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 h-4 shrink-0 bg-amber-500/10 text-amber-600 border border-amber-500/20"
                          >
                            {conv.preBookingMessageCount ?? 0}/3
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Area: Active Chat Window */}
        <div
          className={`md:col-span-8 lg:col-span-8 h-full flex flex-col ${
            showMobileChat ? 'flex' : 'hidden md:flex'
          }`}
        >
          {showMobileChat && (
            <div className="md:hidden pb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMobileChat(false)}
                className="text-xs pl-0"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back to conversations
              </Button>
            </div>
          )}

          {activeConversation ? (
            <ChatWindow
              conversation={activeConversation}
              currentUserId={user.id}
              onConversationUpdated={fetchConversations}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-muted/10 rounded-2xl border border-dashed border-border/80">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-4">
                <Sparkles className="h-8 w-8" />
              </div>
              <h3 className="font-serif text-lg font-medium text-foreground mb-1">
                Your Sanctuary Communications
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm leading-relaxed mb-6">
                Select a guide from the sidebar to continue your journey, ask preparatory questions,
                or exchange session notes safely.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a href="/explore">Browse Guides</a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[80vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <MessagesContent />
    </Suspense>
  );
}
