import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { User } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { PaymentService } from '../payment/payment.service';

/**
 * Consultation-fee refunds raised when the studio declines an account-less
 * inquiry. The record is created in ProjectRequestService.decideInquiry; this
 * service only lists them and processes the payout (one click: Stripe refund
 * to the card + stamp processedAt).
 */
@Injectable()
export class ConsultationRefundService {
  private readonly logger = new Logger(ConsultationRefundService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private paymentService: PaymentService,
  ) {}

  async getAll() {
    const refunds = await this.prisma.consultationRefund.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        processedBy: { select: { id: true, name: true, email: true } },
        projectRequest: {
          select: { id: true, inquiryStatus: true, deletedAt: true },
        },
      },
    });

    return {
      success: true,
      data: refunds,
      pending: refunds.filter((r) => r.status === 'PENDING').length,
    };
  }

  /**
   * Refund the fee to the card and mark the record processed — in one step.
   */
  async process(id: string, actor: User) {
    const refund = await this.prisma.consultationRefund.findUnique({
      where: { id },
    });
    if (!refund) throw new NotFoundException('Consultation refund not found');
    if (refund.status === 'PROCESSED') {
      throw new BadRequestException('This refund has already been processed');
    }

    const stripeRefund = await this.paymentService.refundConsultationPayment(
      refund.consultationPaymentId,
    );

    const updated = await this.prisma.consultationRefund.update({
      where: { id },
      data: {
        status: 'PROCESSED',
        stripeRefundId: stripeRefund.id,
        processedById: actor.id,
        processedAt: new Date(),
      },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        processedBy: { select: { id: true, name: true, email: true } },
      },
    });

    this.logger.log(
      `Consultation refund ${id} processed by ${actor.email} — Stripe refund ${stripeRefund.id}`,
    );

    return {
      success: true,
      message: `Refund of $${Number(refund.amount).toLocaleString('en-US')} issued to ${refund.email}.`,
      data: updated,
    };
  }

  /**
   * Daily nudge for consultation refunds that were raised but never paid out.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async remindPendingConsultationRefunds() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const outstanding = await this.prisma.consultationRefund.findMany({
      where: { status: 'PENDING', createdAt: { lte: dayAgo } },
    });
    if (outstanding.length === 0) return { reminded: 0 };

    const recipients = await this.prisma.user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'FINANCE'] }, isActive: true },
      select: { id: true },
    });

    for (const refund of outstanding) {
      await Promise.all(
        recipients.map((r) =>
          this.notificationService.createNotification({
            userId: r.id,
            type: 'CONSULTATION_REFUND_PAYOUT_REMINDER',
            title: 'Consultation refund awaiting payout',
            message: `${refund.clientName}'s consultation refund of $${Number(refund.amount).toLocaleString('en-US')} for "${refund.projectName}" still needs processing.`,
            link: '/dashboard/consultation-refunds',
            projectRequestId: refund.projectRequestId,
          }),
        ),
      );
    }

    this.logger.log(
      `[Consultation refund reminder] ${outstanding.length} pending payout(s) sent to ${recipients.length} manager(s)`,
    );
    return { reminded: outstanding.length };
  }
}
