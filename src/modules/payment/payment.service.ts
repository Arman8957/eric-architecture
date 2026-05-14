import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from './stripe.service';
import { NotificationService } from '../notification/notification.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { User, PaymentType, PaymentStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private notificationService: NotificationService,
    private config: ConfigService,
  ) {}

  /**
   * Create a Stripe checkout session and record a pending payment
   */
  async createCheckout(dto: CreateCheckoutDto, user: User) {
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:5173');

    const paymentType = dto.paymentType === 'LUMP_SUM'
      ? PaymentType.LUMP_SUM
      : PaymentType.INSTALLMENT;

    // Create the payment record first
    const payment = await this.prisma.payment.create({
      data: {
        userId: user.id,
        projectRequestId: dto.projectRequestId,
        proposalId: dto.proposalId,
        stageId: dto.stageId || null,
        stageName: dto.stageName || null,
        amount: dto.amount,
        paymentType,
        paymentStatus: PaymentStatus.PENDING,
      },
    });

    // Create Stripe checkout session
    const session = await this.stripeService.createCheckoutSession({
      amount: dto.amount,
      projectName: dto.projectName,
      stageName: dto.stageName,
      paymentType: dto.paymentType,
      successUrl: `${frontendUrl}/user-dashboard?payment=success&paymentId=${payment.id}`,
      cancelUrl: `${frontendUrl}/user-dashboard?payment=cancelled`,
      metadata: {
        paymentId: payment.id,
        userId: user.id,
        projectRequestId: dto.projectRequestId,
        proposalId: dto.proposalId,
        stageId: dto.stageId || '',
        paymentType: dto.paymentType,
      },
    });

    // Update payment with Stripe session ID
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { stripeSessionId: session.sessionId },
    });

    return {
      paymentId: payment.id,
      sessionId: session.sessionId,
      checkoutUrl: session.url,
    };
  }

  /**
   * Handle Stripe webhook — mark payment as completed
   */
  async handleWebhookEvent(event: any) {
    this.logger.log(`Received Stripe webhook event: ${event.type}`);

    let paymentId: string | undefined;

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      paymentId = session.metadata?.paymentId;
    } else if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      paymentId = paymentIntent.metadata?.paymentId;
    }

    if (paymentId) {
      const payment = await this.prisma.payment.findUnique({
        where: { id: paymentId },
      });

      if (!payment) {
        this.logger.warn(`Webhook: payment ${paymentId} not found in database`);
        return;
      }

      if (payment.paymentStatus === PaymentStatus.COMPLETED) {
        this.logger.log(`Webhook: payment ${paymentId} already marked as COMPLETED`);
        return;
      }

      await this.prisma.payment.update({
        where: { id: paymentId },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
          stripePaymentIntentId: event.data.object.payment_intent || event.data.object.id,
        },
      });

      // Notify user
      await this.notificationService.createNotification({
        userId: payment.userId,
        type: 'PAYMENT_CONFIRMED',
        title: 'Payment Confirmed',
        message: payment.stageName
          ? `Your payment of $${payment.amount} for "${payment.stageName}" has been confirmed.`
          : `Your lump sum payment of $${payment.amount} has been confirmed.`,
        link: '/user-dashboard',
      });

      this.logger.log(`Webhook: Payment ${paymentId} marked as COMPLETED successfully`);
    }
  }

  /**
   * Confirm a payment manually (after redirect back from Stripe)
   */
  async confirmPayment(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId !== userId) throw new BadRequestException('Unauthorized');

    // If still pending, try to verify with Stripe
    if (payment.paymentStatus === 'PENDING' && payment.stripeSessionId) {
      try {
        const session = await this.stripeService.retrieveSession(payment.stripeSessionId);
        if (session.payment_status === 'paid') {
          await this.prisma.payment.update({
            where: { id: paymentId },
            data: {
              paymentStatus: PaymentStatus.COMPLETED,
              stripePaymentIntentId: typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id,
            },
          });
          return { ...payment, paymentStatus: 'COMPLETED' };
        }
      } catch (err) {
        this.logger.error('Failed to verify payment with Stripe', err);
      }
    }

    return payment;
  }

  /**
   * Get payment status for all stages of a project
   */
  async getPaymentStatus(projectRequestId: string, userId: string) {
    // Fetch ALL payments (including PENDING) to diagnose sync issues
    let payments = await this.prisma.payment.findMany({
      where: {
        projectRequestId,
      },
    });

    // SELF-HEALING: If we find PENDING payments, check their status with Stripe in real-time
    const pendingPayments = payments.filter(p => p.paymentStatus === 'PENDING' && p.stripeSessionId);
    if (pendingPayments.length > 0) {
      for (const p of pendingPayments) {
        try {
          const session = await this.stripeService.retrieveSession(p.stripeSessionId as string);
          
          if (session.payment_status === 'paid') {
            const updated = await this.prisma.payment.update({
              where: { id: p.id },
              data: {
                paymentStatus: PaymentStatus.COMPLETED,
                stripePaymentIntentId: typeof session.payment_intent === 'string' 
                  ? session.payment_intent 
                  : session.payment_intent?.id,
              },
            });
            // Update our local list
            const idx = payments.findIndex(item => item.id === p.id);
            if (idx !== -1) payments[idx] = updated;
          }
        } catch (error) {
          // Silently fail or log to a logger in production
        }
      }
    }

    // Now filter for COMPLETED ones for calculations, but keep raw list for debugging
    const completedPayments = payments.filter(p => p.paymentStatus === 'COMPLETED');

    // Get the proposal to check payment type
    const proposal = await this.prisma.proposal.findFirst({
      where: { projectRequestId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        paymentMethod: true,
        paymentType: true,
        totalAmount: true,
        services: {
          select: { id: true, name: true, amount: true, order: true },
          orderBy: { order: 'asc' },
        },
        projectRequest: {
          select: { consultationPaymentId: true },
        },
      },
    });

    const project = await this.prisma.projectRequest.findUnique({
      where: { id: projectRequestId },
      select: { consultationPaymentId: true },
    });

    // Get stages
    const stages = await this.prisma.projectStage.findMany({
      where: { projectRequestId },
      orderBy: { order: 'asc' },
    });

    const isLumpSum = proposal?.paymentMethod === 'lumpSum' ||
                      proposal?.paymentMethod === 'LUMP_SUM' ||
                      proposal?.paymentType === 'LUMP_SUM';

    const isLumpSumPaid = completedPayments.some(p => p.paymentType === 'LUMP_SUM');

    // Build a map of paid stages
    const paidStageIds = new Set(
      payments
        .filter(p => p.paymentType === 'INSTALLMENT' && p.stageId)
        .map(p => p.stageId),
    );

    // Build payment status per stage
    const stagePaymentStatus = stages.map((stage, idx) => {
      // Find corresponding service for pricing
      const service = proposal?.services?.[idx];
      const amount = service ? Number(service.amount) : 0;

      if (isLumpSum) {
        return {
          stageId: stage.id,
          stageName: stage.name,
          amount,
          paid: isLumpSumPaid,
          canPay: !isLumpSumPaid, // only show pay for lump sum at top level
          canViewFiles: isLumpSumPaid,
        };
      }

      // Installment logic
      const isPaid = paidStageIds.has(stage.id);
      // Can pay if: previous stage is completed or it's the first stage
      const previousCompleted = idx === 0 || stages[idx - 1]?.status === 'COMPLETED';

      return {
        stageId: stage.id,
        stageName: stage.name,
        amount,
        paid: isPaid,
        canPay: !isPaid && previousCompleted,
        canViewFiles: isPaid,
      };
    });

    // ─── Amendment Proposals Payment Status ────────────────────────────
    // Find all accepted amendment proposals for this project
    const amendmentProposals = await this.prisma.proposal.findMany({
      where: {
        projectRequestId,
        proposalType: 'AMENDMENT',
        status: 'ACCEPTED',
      },
      select: {
        id: true,
        proposalNumber: true,
        title: true,
        projectName: true,
        totalAmount: true,
        services: {
          select: { id: true, name: true, amount: true, order: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Build amendment payment status
    const amendmentPayments = amendmentProposals.map((ap) => {
      const amountDue = Number(ap.totalAmount);
      // Check if there's a completed payment for this amendment proposal
      const isPaid = completedPayments.some(
        (p) => p.proposalId === ap.id,
      );
      return {
        proposalId: ap.id,
        proposalNumber: ap.proposalNumber,
        title: ap.title || ap.projectName,
        projectName: ap.projectName,
        amount: amountDue,
        paid: isPaid,
        services: ap.services,
      };
    });

    return {
      paymentMethod: isLumpSum ? 'LUMP_SUM' : 'INSTALLMENT',
      totalAmount: proposal ? Number(proposal.totalAmount) : 0,
      totalPaid: completedPayments.reduce((sum, p) => sum + Number(p.amount), 0),
      lumpSumPaid: isLumpSumPaid,
      consultationPaid: !!project?.consultationPaymentId,
      stages: stagePaymentStatus,
      proposal: proposal ? {
        id: proposal.id,
        services: proposal.services,
      } : null,
      amendmentPayments,
    };
  }

  /**
   * Get user's payment history
   */
  async getMyPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: {
        projectRequest: { select: { id: true, projectName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get payments for a project (admin view)
   */
  async getProjectPayments(projectRequestId: string) {
    return this.prisma.payment.findMany({
      where: { projectRequestId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a PaymentIntent for the $250 consultation fee
   */
  async createConsultationIntent(user: User) {
    const amount = 250;
    const { clientSecret, id } = await this.stripeService.createPaymentIntent({
      amount,
      metadata: {
        userId: user.id,
        type: 'CONSULTATION_FEE',
      },
      description: `Consultation Fee — ${user.name || user.email}`,
    });

    return {
      clientSecret,
      paymentIntentId: id,
      amount,
    };
  }

  /**
   * Verify that a consultation fee PaymentIntent is valid and succeeded
   */
  async verifyConsultationPayment(paymentIntentId: string, userId: string) {
    try {
      const intent = await this.stripeService.retrievePaymentIntent(paymentIntentId);
      
      if (intent.status !== 'succeeded') {
        throw new BadRequestException('Payment has not succeeded yet');
      }

      if (intent.amount !== 25000) { // $250 in cents
        throw new BadRequestException('Incorrect payment amount');
      }

      if (intent.metadata.userId !== userId) {
        throw new BadRequestException('Payment was made by a different user');
      }

      return true;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Failed to verify payment intent ${paymentIntentId}`, err);
      throw new BadRequestException('Invalid payment intent');
    }
  }
}
