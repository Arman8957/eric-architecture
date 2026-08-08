import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { MailerService } from 'src/utils/email/email.service';
import { EncryptionService } from 'src/common/encryption/encryption.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { User } from '@prisma/client';

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private mailerService: MailerService,
    private encryption: EncryptionService,
  ) {}

  /**
   * Create a refund request. Saves bank details if provided (first time).
   * Bank account and routing numbers are encrypted at rest.
   */
  async createRefundRequest(dto: CreateRefundDto, user: User) {
    if (dto.bankDetails) {
      const encryptedAccountNumber = this.encryption.encrypt(dto.bankDetails.accountNumber);
      const encryptedRoutingNumber = dto.bankDetails.routingNumber
        ? this.encryption.encrypt(dto.bankDetails.routingNumber)
        : '';

      await this.prisma.userBankDetails.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          bankName: dto.bankDetails.bankName,
          accountNumber: encryptedAccountNumber,
          routingNumber: encryptedRoutingNumber,
          branchName: dto.bankDetails.branchName,
          bankType: dto.bankDetails.bankType,
        },
        update: {
          bankName: dto.bankDetails.bankName,
          accountNumber: encryptedAccountNumber,
          routingNumber: encryptedRoutingNumber,
          branchName: dto.bankDetails.branchName,
          bankType: dto.bankDetails.bankType,
        },
      });
    }

    const bankDetails = await this.prisma.userBankDetails.findUnique({
      where: { userId: user.id },
    });

    if (!bankDetails) {
      throw new BadRequestException('Bank details are required to request a refund');
    }

    const projectRequest = await this.prisma.projectRequest.findUnique({
      where: { id: dto.projectRequestId },
      include: { assignedManager: true },
    });

    if (!projectRequest) {
      throw new NotFoundException('Project request not found');
    }

    const refundRequest = await this.prisma.refundRequest.create({
      data: {
        userId: user.id,
        projectRequestId: dto.projectRequestId,
        stageId: dto.stageId,
        stageName: dto.stageName,
        refundName: `Refund for ${dto.stageName}`,
        refundDescription: dto.refundDescription,
        refundCause: dto.refundCause,
        amount: dto.amount,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        projectRequest: { select: { id: true, projectName: true } },
      },
    });

    const financeUsers = await this.prisma.user.findMany({
      where: {
        role: { in: ['FINANCE', 'SUPER_ADMIN', 'ADMIN'] },
        isActive: true,
      },
      select: { id: true },
    });

    // The assigned manager is often also an ADMIN/SUPER_ADMIN, which used to
    // produce two identical notifications - dedupe the recipients.
    const recipientIds = new Set(financeUsers.map((f) => f.id));
    if (projectRequest.assignedManagerId) {
      recipientIds.add(projectRequest.assignedManagerId);
    }

    for (const recipientId of recipientIds) {
      await this.notificationService.createNotification({
        userId: recipientId,
        type: 'REFUND_REQUEST',
        title: 'New Refund Request',
        message: `${user.name || user.email} requested a refund for "${dto.stageName}" on project "${projectRequest.projectName}"`,
        link: '/dashboard/refund-requests',
        projectRequestId: dto.projectRequestId,
      });
    }

    this.logger.log(`Refund request created: ${refundRequest.id} by user ${user.id}`);
    return refundRequest;
  }

  async getAllRefundRequests() {
    return this.prisma.refundRequest.findMany({
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        projectRequest: { select: { id: true, projectName: true, assignedManagerId: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyRefundRequests(userId: string) {
    return this.prisma.refundRequest.findMany({
      where: { userId },
      include: {
        projectRequest: { select: { id: true, projectName: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveRefund(refundId: string, approver: User) {
    const refund = await this.prisma.refundRequest.findUnique({
      where: { id: refundId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        projectRequest: { select: { id: true, projectName: true } },
      },
    });

    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.refundStatus !== 'PENDING') {
      throw new BadRequestException('Refund request is not pending');
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundId },
      data: {
        refundStatus: 'APPROVED',
        approvedById: approver.id,
        approvedAt: new Date(),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        projectRequest: { select: { id: true, projectName: true } },
      },
    });

    if (refund.user.email) {
      try {
        await this.mailerService.sendRefundAcceptedEmail(
          refund.user.email,
          refund.user.name || 'Valued Client',
          {
            refundName: refund.refundName,
            projectName: refund.projectRequest.projectName,
            amount: Number(refund.amount),
            stageName: refund.stageName,
          },
        );
      } catch (err) {
        this.logger.error('Failed to send refund accepted email', err);
      }
    }

    await this.notificationService.createNotification({
      userId: refund.userId,
      type: 'REFUND_APPROVED',
      title: 'Refund Request Approved',
      message: `Your refund request for "${refund.stageName}" has been approved.`,
      link: '/user-dashboard',
    });

    return updated;
  }

  async rejectRefund(refundId: string, approver: User, rejectionReason?: string) {
    const refund = await this.prisma.refundRequest.findUnique({
      where: { id: refundId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        projectRequest: { select: { id: true, projectName: true } },
      },
    });

    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.refundStatus !== 'PENDING') {
      throw new BadRequestException('Refund request is not pending');
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundId },
      data: {
        refundStatus: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason,
      },
    });

    // The client is told by email as well as in-app.
    if (refund.user.email) {
      try {
        await this.mailerService.sendRefundRejectedEmail(
          refund.user.email,
          refund.user.name || 'Valued Client',
          {
            refundName: refund.refundName,
            projectName: refund.projectRequest.projectName,
            amount: Number(refund.amount),
            stageName: refund.stageName,
            rejectionReason,
          },
        );
      } catch (err) {
        this.logger.error('Failed to send refund rejected email', err);
      }
    }

    await this.notificationService.createNotification({
      userId: refund.userId,
      type: 'REFUND_REJECTED',
      title: 'Refund Request Rejected',
      message: `Your refund request for "${refund.stageName}" has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
      link: '/user-dashboard',
    });

    return updated;
  }

  /**
   * Accountant confirms the approved refund has actually been paid out. This
   * stops the daily reminder and flips the UI to "Refund Processed".
   */
  async markRefundProcessed(refundId: string, actor: User) {
    const refund = await this.prisma.refundRequest.findUnique({
      where: { id: refundId },
    });

    if (!refund) throw new NotFoundException('Refund request not found');
    if (refund.refundStatus !== 'APPROVED') {
      throw new BadRequestException('Only approved refunds can be marked processed');
    }
    if (refund.refundProcessedAt) {
      throw new BadRequestException('This refund is already marked processed');
    }

    const updated = await this.prisma.refundRequest.update({
      where: { id: refundId },
      data: {
        refundProcessedAt: new Date(),
        refundProcessedBy: actor.id,
      },
    });

    await this.notificationService.createNotification({
      userId: refund.userId,
      type: 'REFUND_PROCESSED',
      title: 'Refund Processed',
      message: `Your refund for "${refund.stageName}" has been processed and sent to your bank.`,
      link: '/user-dashboard',
    });

    this.logger.log(`Refund ${refundId} marked processed by ${actor.id}`);
    return updated;
  }

  /**
   * Daily nudge: every approved-but-unpaid refund raises one notification per
   * Super Admin / Finance Manager, repeating until Task Completed is clicked.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async remindPendingRefundPayouts() {
    const outstanding = await this.prisma.refundRequest.findMany({
      where: { refundStatus: 'APPROVED', refundProcessedAt: null },
      include: {
        user: { select: { name: true, email: true } },
        projectRequest: { select: { projectName: true } },
      },
    });

    if (outstanding.length === 0) return { reminded: 0 };

    const recipients = await this.prisma.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'FINANCE'] },
        isActive: true,
      },
      select: { id: true },
    });

    for (const refund of outstanding) {
      const clientName = refund.user.name || refund.user.email;
      await Promise.all(
        recipients.map((recipient) =>
          this.notificationService.createNotification({
            userId: recipient.id,
            type: 'REFUND_PAYOUT_REMINDER',
            title: 'Refund awaiting payout',
            message: `${clientName}'s approved refund of $${Number(refund.amount).toLocaleString()} for "${refund.stageName}" on "${refund.projectRequest.projectName}" still needs processing.`,
            link: '/dashboard/refund-requests',
            projectRequestId: refund.projectRequestId,
          }),
        ),
      );
    }

    this.logger.log(
      `[Refund Reminder] ${outstanding.length} outstanding payout(s) sent to ${recipients.length} manager(s)`,
    );
    return { reminded: outstanding.length };
  }

  /**
   * Bank details of the client behind a specific refund request, for the
   * accountant actioning the payout.
   */
  async getBankDetailsForRefund(refundId: string) {
    const refund = await this.prisma.refundRequest.findUnique({
      where: { id: refundId },
      select: {
        userId: true,
        amount: true,
        stageName: true,
        refundProcessedAt: true,
        user: { select: { id: true, name: true, email: true } },
        projectRequest: { select: { projectName: true } },
      },
    });
    if (!refund) throw new NotFoundException('Refund request not found');

    return {
      client: refund.user,
      projectName: refund.projectRequest.projectName,
      stageName: refund.stageName,
      amount: Number(refund.amount),
      refundProcessedAt: refund.refundProcessedAt,
      bankDetails: await this.getUserBankDetails(refund.userId),
    };
  }

  /**
   * Get user's bank details with decrypted account/routing numbers.
   */
  async getUserBankDetails(userId: string) {
    const details = await this.prisma.userBankDetails.findUnique({
      where: { userId },
    });

    if (!details) return null;

    return {
      ...details,
      accountNumber: this.safeDecrypt(details.accountNumber),
      routingNumber: details.routingNumber
        ? this.safeDecrypt(details.routingNumber)
        : null,
    };
  }

  private safeDecrypt(value: string): string {
    try {
      if (this.encryption.isEncrypted(value)) {
        return this.encryption.decrypt(value);
      }
      return value;
    } catch {
      this.logger.warn('Failed to decrypt value, returning masked placeholder');
      return '••••••••';
    }
  }
}
