import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { prisma, UserRole } from '@project-nirvana/db';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  timeZone: string;
}

@Injectable()
export class PolicyService {
  async canAccessBooking(user: AuthenticatedUser, bookingId: string): Promise<boolean> {
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { consumerId: true, providerId: true },
    });

    if (!booking) {
      throw new NotFoundException(`Booking not found`);
    }

    const isAuthorized = booking.consumerId === user.id || booking.providerId === user.id;
    if (!isAuthorized) {
      throw new ForbiddenException('Access denied: You do not own or participate in this booking.');
    }

    return true;
  }

  async canAccessConversation(user: AuthenticatedUser, conversationId: string): Promise<boolean> {
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { consumerId: true, providerId: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isAuthorized = conversation.consumerId === user.id || conversation.providerId === user.id;
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Access denied: You are not a participant in this conversation.',
      );
    }

    return true;
  }

  async canManageProviderProfile(user: AuthenticatedUser, profileId: string): Promise<boolean> {
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    const profile = await prisma.providerProfile.findUnique({
      where: { id: profileId },
      select: { userId: true },
    });

    if (!profile) {
      throw new NotFoundException('Provider profile not found');
    }

    if (profile.userId !== user.id) {
      throw new ForbiddenException(
        'Access denied: You can only manage your own practitioner profile.',
      );
    }

    return true;
  }
}
