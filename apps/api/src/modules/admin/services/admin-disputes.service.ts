import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  prisma,
  Prisma,
  DisputeStatus,
  BookingStatus,
  LedgerAccountType,
  LedgerEntryType,
} from '@project-nirvana/db';
import {
  AdminDisputesQuery,
  AdminDisputeResolution,
  AdminChatLogAccess,
} from '@project-nirvana/shared';
import { AuditService } from '../../audit/audit.service';
import { MessageEncryptionService } from '../../messaging/services/message-encryption.service';
import { AuthenticatedUser } from '../../auth/policies/policy.service';

@Injectable()
export class AdminDisputesService {
  constructor(
    private readonly auditService: AuditService,
    private readonly encryptionService: MessageEncryptionService,
  ) {}

  async listDisputes(query: AdminDisputesQuery) {
    const { status, page = 1, limit = 20, exportCsv } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DisputeWhereInput = {};
    if (status) {
      where.status = status as DisputeStatus;
    }

    if (exportCsv) {
      const allDisputes = await prisma.dispute.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          raisedBy: { select: { email: true } },
          booking: {
            select: {
              id: true,
              priceSnapshot: true,
              provider: {
                select: {
                  email: true,
                  providerProfile: { select: { displayName: true } },
                },
              },
              consumer: { select: { email: true } },
            },
          },
        },
      });

      const header =
        'DisputeID,BookingID,RaisedBy,Consumer,Provider,Status,AmountPaise,Reason,CreatedAt\n';
      const rows = allDisputes
        .map((d) => {
          const r = `"${(d.reason || '').replace(/"/g, '""')}"`;
          const c = `"${d.booking.consumer.email}"`;
          const p = `"${d.booking.provider.providerProfile?.displayName || 'Practitioner'}"`;
          return `${d.id},${d.booking.id},"${d.raisedBy.email}",${c},${p},${d.status},${d.booking.priceSnapshot},${r},${d.createdAt.toISOString()}`;
        })
        .join('\n');

      return { csv: header + rows, filename: `disputes-export-${Date.now()}.csv` };
    }

    const [total, disputes] = await Promise.all([
      prisma.dispute.count({ where }),
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          raisedBy: { select: { id: true, email: true, role: true } },
          booking: {
            include: {
              consumer: { select: { id: true, email: true } },
              provider: {
                select: {
                  id: true,
                  email: true,
                  providerProfile: { select: { displayName: true, slug: true } },
                },
              },
              service: { select: { id: true, title: true, durationMin: true, mode: true } },
              payments: { select: { id: true, status: true, amount: true, gateway: true } },
              session: {
                select: { id: true, videoRoomName: true, startedAt: true, endedAt: true },
              },
            },
          },
        },
      }),
    ]);

    return {
      disputes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDisputeEvidence(disputeId: string) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        raisedBy: { select: { id: true, email: true, role: true } },
        booking: {
          include: {
            consumer: { select: { id: true, email: true, phone: true } },
            provider: {
              select: {
                id: true,
                email: true,
                providerProfile: {
                  select: {
                    id: true,
                    displayName: true,
                    slug: true,
                    ratingAvg: true,
                    ratingCount: true,
                    reliabilityStrikes: true,
                  },
                },
              },
            },
            service: true,
            payments: true,
            session: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute ${disputeId} not found`);
    }

    const auditTrail = await prisma.auditLog.findMany({
      where: { entityId: disputeId },
      orderBy: { createdAt: 'desc' },
    });

    return { dispute, auditTrail };
  }

  /**
   * Access confidential session chat logs ONLY with a recorded justification.
   * This action is strictly audit-logged.
   */
  async accessDisputeChatLogs(
    adminUser: AuthenticatedUser,
    disputeId: string,
    dto: AdminChatLogAccess,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          select: {
            id: true,
            consumerId: true,
            providerId: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute ${disputeId} not found`);
    }

    const consumerId = dispute.booking.consumerId;
    const providerUserId = dispute.booking.providerId;

    // MANDATORY AUDIT LOG RECORDING BEFORE RETURN
    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_DISPUTE_CHAT_LOGS_ACCESSED',
      entityType: 'Dispute',
      entityId: disputeId,
      reason: dto.reason,
      ipAddress,
      userAgent,
      metadata: {
        disputeId,
        bookingId: dispute.bookingId,
        consumerId,
        providerUserId,
        adminEmail: adminUser.email,
      },
    });

    // Locate conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { consumerId, providerId: providerUserId },
          { consumerId: providerUserId, providerId: consumerId },
        ],
      },
    });

    if (!conversation) {
      return {
        messages: [],
        notice: 'No private messaging transcript exists between consumer and provider.',
      };
    }

    // Retrieve encrypted messages
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, email: true, role: true } },
      },
    });

    // Decrypt messages securely
    const decryptedMessages = messages.map((m) => {
      let plaintext = '[Encrypted message]';
      try {
        if (m.ciphertext && m.iv && m.authTag) {
          plaintext = this.encryptionService.decrypt({
            ciphertext: m.ciphertext,
            iv: m.iv,
            authTag: m.authTag,
            keyVersion: m.keyVersion,
          });
        }
      } catch {
        plaintext = '[Decryption failed - message integrity check failed]';
      }

      return {
        id: m.id,
        senderId: m.senderId,
        senderEmail: m.sender.email,
        senderRole: m.sender.role,
        content: plaintext,
        hasAttachment: !!m.attachmentUrl,
        attachmentType: m.attachmentType,
        createdAt: m.createdAt.toISOString(),
      };
    });

    return {
      conversationId: conversation.id,
      disputeId,
      justificationReason: dto.reason,
      accessedAt: new Date().toISOString(),
      messages: decryptedMessages,
    };
  }

  async resolveDispute(
    adminUser: AuthenticatedUser,
    disputeId: string,
    dto: AdminDisputeResolution,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const dispute = await prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        booking: {
          include: {
            payments: true,
            provider: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new NotFoundException(`Dispute ${disputeId} not found`);
    }

    if (
      dispute.status === DisputeStatus.RESOLVED_REFUND ||
      dispute.status === DisputeStatus.RESOLVED_RELEASE ||
      dispute.status === DisputeStatus.DISMISSED
    ) {
      throw new BadRequestException(`Dispute has already been finalized (${dispute.status}).`);
    }

    const beforeState = {
      status: dispute.status,
      adminNotes: dispute.adminNotes,
    };

    let newDisputeStatus: DisputeStatus;
    const bookingId = dispute.bookingId;
    const price = dispute.booking.priceSnapshot;
    const refundAmount = dto.refundAmountPaise ?? price;

    await prisma.$transaction(async (tx) => {
      if (dto.action === 'REFUND_FULL' || dto.action === 'REFUND_PARTIAL') {
        newDisputeStatus = DisputeStatus.RESOLVED_REFUND;

        await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.REFUNDED, refundAmount },
        });

        // Double entry: debits platform escrow, credits refund escrow
        await tx.ledgerEntry.createMany({
          data: [
            {
              bookingId,
              accountType: LedgerAccountType.PLATFORM_ESCROW,
              entryType: LedgerEntryType.DEBIT,
              amount: refundAmount,
              currency: 'INR',
              description: `Dispute refund release: ${dto.reason}`,
            },
            {
              bookingId,
              accountType: LedgerAccountType.REFUND_ESCROW,
              entryType: LedgerEntryType.CREDIT,
              amount: refundAmount,
              currency: 'INR',
              description: `Dispute settlement credited to seeker`,
            },
          ],
        });
      } else if (dto.action === 'RELEASE_ESCROW') {
        newDisputeStatus = DisputeStatus.RESOLVED_RELEASE;

        await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.COMPLETED },
        });

        const commissionBps = dispute.booking.commissionBps || 1500;
        const platformShare = Math.round((price * commissionBps) / 10000);
        const providerShare = price - platformShare;

        await tx.ledgerEntry.createMany({
          data: [
            {
              bookingId,
              accountType: LedgerAccountType.PLATFORM_ESCROW,
              entryType: LedgerEntryType.DEBIT,
              amount: price,
              currency: 'INR',
              description: `Escrow released on dispute settlement: ${dto.reason}`,
            },
            {
              bookingId,
              accountType: LedgerAccountType.PLATFORM_REVENUE,
              entryType: LedgerEntryType.CREDIT,
              amount: platformShare,
              currency: 'INR',
              description: `Platform fee (${commissionBps / 100}%)`,
            },
            {
              bookingId,
              accountType: LedgerAccountType.PROVIDER_PAYABLE,
              entryType: LedgerEntryType.CREDIT,
              amount: providerShare,
              currency: 'INR',
              description: `Practitioner share credited to payable`,
            },
          ],
        });
      } else {
        // DISMISS
        newDisputeStatus = DisputeStatus.DISMISSED;
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: BookingStatus.COMPLETED },
        });
      }

      if (dto.strikePenalty) {
        await tx.providerProfile.update({
          where: { userId: dispute.booking.providerId },
          data: { reliabilityStrikes: { increment: 1 } },
        });
      }

      await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: newDisputeStatus,
          resolutionNotes: dto.reason,
          adminNotes: dto.adminNotes,
          resolvedAt: new Date(),
        },
      });
    });

    const afterState = {
      status: newDisputeStatus!,
      resolutionNotes: dto.reason,
      strikePenalty: dto.strikePenalty,
    };

    await this.auditService.record({
      userId: adminUser.id,
      action: 'ADMIN_DISPUTE_RESOLVED',
      entityType: 'Dispute',
      entityId: disputeId,
      reason: dto.reason,
      beforeState,
      afterState,
      ipAddress,
      userAgent,
      metadata: { action: dto.action, refundAmountPaise: refundAmount },
    });

    return {
      success: true,
      message: `Dispute resolved as ${newDisputeStatus!}.`,
    };
  }
}
