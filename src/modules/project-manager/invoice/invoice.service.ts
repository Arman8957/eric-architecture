import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  InvoiceStatus,
  InvoiceType,
  Prisma,
  User,
  UserRole,
} from '@prisma/client';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { StripeService } from 'src/modules/payment/stripe.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { clientProjectLink } from 'src/common/notification-links';

/** Who may raise a bill against a project, and cancel one before it is paid. */
const INVOICE_MANAGERS = new Set<UserRole>([
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROJECT_MANAGER,
]);

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
    private notification: NotificationService,
  ) {}

  /** What the client and the dashboard both need to render an invoice. */
  private readonly invoiceSelect = Prisma.validator<Prisma.InvoiceSelect>()({
    id: true,
    projectRequestId: true,
    proposalId: true,
    name: true,
    description: true,
    type: true,
    amount: true,
    status: true,
    paidAt: true,
    cancelledAt: true,
    cancelReason: true,
    createdAt: true,
    createdBy: { select: { id: true, name: true, email: true } },
    cancelledBy: { select: { id: true, name: true, email: true } },
    proposal: {
      select: { id: true, proposalNumber: true, title: true, proposalType: true },
    },
  });

  async create(projectId: string, dto: CreateInvoiceDto, user: User) {
    if (!INVOICE_MANAGERS.has(user.role)) {
      throw new ForbiddenException('Not authorized to raise invoices');
    }

    const project = await this.prisma.projectRequest.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    // A contract from another project would attach this bill to the wrong
    // client's paperwork, so the link is checked rather than trusted.
    if (dto.proposalId) {
      const proposal = await this.prisma.proposal.findUnique({
        where: { id: dto.proposalId },
        select: { id: true, projectRequestId: true },
      });
      if (!proposal || proposal.projectRequestId !== projectId) {
        throw new BadRequestException(
          'That contract does not belong to this project',
        );
      }
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        projectRequestId: projectId,
        proposalId: dto.proposalId ?? null,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        // Raised means sent — there is no draft state. An invoice the client
        // cannot see is just a note, and the PM can cancel this one anyway.
        status: InvoiceStatus.SENT,
        createdById: user.id,
      },
      select: this.invoiceSelect,
    });

    this.logger.log(
      `Invoice ${invoice.id} (${dto.type}, ${dto.amount}) raised on project ${projectId} by ${user.email}`,
    );

    // "Sent to the client" has to mean something — an invoice they are never
    // told about cannot be paid. Best effort: the bill exists either way, so a
    // notification failure must not undo it.
    const owner = await this.prisma.projectRequest.findUnique({
      where: { id: projectId },
      select: { userId: true, projectName: true },
    });
    if (owner?.userId) {
      try {
        await this.notification.createNotification({
          userId: owner.userId,
          type: 'PAYMENT_REQUESTED',
          title: 'New invoice',
          message: `An invoice for ${invoice.name} ($${Number(invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}) is ready to pay.`,
          link: clientProjectLink(projectId, 'meetings'),
          projectRequestId: projectId,
        });
      } catch (error) {
        this.logger.warn(
          `Invoice ${invoice.id} raised but the client could not be notified`,
          error as Error,
        );
      }
    }

    return invoice;
  }

  /** Every invoice on a project, newest first. Cancelled ones included. */
  async findByProject(projectId: string) {
    return this.prisma.invoice.findMany({
      where: { projectRequestId: projectId },
      orderBy: { createdAt: 'desc' },
      select: this.invoiceSelect,
    });
  }

  /**
   * Withdraws an invoice.
   *
   * Before payment this is the PM's own correction — scopes change, and a bill
   * the client has not acted on should be retractable. After payment it
   * reverses money already received, which is why it narrows to SUPER_ADMIN
   * rather than being blocked outright: it has to be possible, but not casual.
   */
  async cancel(
    projectId: string,
    invoiceId: string,
    reason: string | undefined,
    user: User,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, projectRequestId: true, status: true },
    });

    if (!invoice || invoice.projectRequestId !== projectId) {
      throw new NotFoundException('Invoice not found on this project');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('That invoice is already cancelled');
    }

    if (invoice.status === InvoiceStatus.PAID) {
      if (user.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'This invoice has been paid. Only a Super Admin can cancel it.',
        );
      }
    } else if (!INVOICE_MANAGERS.has(user.role)) {
      throw new ForbiddenException('Not authorized to cancel invoices');
    }

    const cancelled = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledById: user.id,
        cancelledAt: new Date(),
        cancelReason: reason?.trim() || null,
      },
      select: this.invoiceSelect,
    });

    this.logger.log(
      `Invoice ${invoiceId} cancelled by ${user.email} (was ${invoice.status})`,
    );

    return cancelled;
  }

  /**
   * Starts a Stripe checkout for an invoice and hands back the URL to send the
   * client to.
   *
   * The invoice carries its own `stripeSessionId` rather than borrowing a
   * `Payment` row: that model requires a `proposalId`, and an invoice settles
   * no contract — inventing a proposal link to satisfy the column would put
   * invoice money into contract totals, which is exactly what these are meant
   * to be kept apart from.
   */
  async createCheckoutSession(
    projectId: string,
    invoiceId: string,
    user: User,
    frontendUrl: string,
  ) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        projectRequest: {
          select: { id: true, userId: true, projectName: true },
        },
      },
    });

    if (!invoice || invoice.projectRequestId !== projectId) {
      throw new NotFoundException('Invoice not found on this project');
    }

    // The project's own client, or staff acting on their behalf. Anyone else
    // has no business opening a payment page for someone else's bill.
    const isClient = invoice.projectRequest.userId === user.id;
    if (!isClient && !INVOICE_MANAGERS.has(user.role)) {
      throw new ForbiddenException('Not authorized to pay this invoice');
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('That invoice has been cancelled');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('That invoice has already been paid');
    }

    const base = frontendUrl.replace(/\/$/, '');
    const session = await this.stripe.createCheckoutSession({
      amount: Number(invoice.amount),
      projectName: invoice.projectRequest.projectName || 'Project',
      stageName: invoice.name,
      paymentType: 'INVOICE',
      successUrl: `${base}/user-dashboard?project=${projectId}&tab=meetings&invoice=${invoice.id}&paid=1`,
      cancelUrl: `${base}/user-dashboard?project=${projectId}&tab=meetings&invoice=${invoice.id}`,
      // What the webhook keys off. `invoiceId` is what tells it this is an
      // invoice rather than a contract payment.
      metadata: {
        invoiceId: invoice.id,
        projectRequestId: projectId,
        invoiceType: invoice.type,
      },
    });

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripeSessionId: session.sessionId },
    });

    return { sessionId: session.sessionId, checkoutUrl: session.url };
  }

  /**
   * Marks an invoice settled.
   *
   * `paidAt` is stamped here and is what the accounts date the money to — a
   * bill raised in December and settled in January is January's income, which
   * is what keeps the monthly figures summing to the annual total.
   */
  async markPaid(invoiceId: string, stripePaymentIntentId?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, status: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException(
        'That invoice was cancelled and cannot be paid',
      );
    }
    // Settling twice would count the money twice. Stripe can deliver the same
    // event more than once, so this is a no-op rather than an error.
    if (invoice.status === InvoiceStatus.PAID) return invoice;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        stripePaymentIntentId: stripePaymentIntentId ?? undefined,
      },
      select: this.invoiceSelect,
    });
  }

  /**
   * Settles an invoice on the client's return from Stripe, by asking Stripe
   * directly rather than waiting to be told.
   *
   * The webhook is the primary path and stays so. But it is a call *into* this
   * server, which means it does not arrive at all unless Stripe can reach it —
   * it cannot reach a laptop, so in local development an invoice paid on
   * Stripe's own page simply stayed SENT. In production it is the missed
   * delivery, the signature mismatch, the minutes of retries.
   *
   * Checking on return closes both. The client is already being sent back to a
   * URL naming this invoice, so the answer is one API call away, and Stripe is
   * the authority either way. Idempotent by way of `markPaid`, so whichever of
   * the two arrives second changes nothing.
   */
  async confirmPayment(projectId: string, invoiceId: string, user: User) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        projectRequestId: true,
        status: true,
        stripeSessionId: true,
        projectRequest: { select: { userId: true } },
      },
    });

    if (!invoice || invoice.projectRequestId !== projectId) {
      throw new NotFoundException('Invoice not found on this project');
    }

    const isClient = invoice.projectRequest.userId === user.id;
    if (!isClient && !INVOICE_MANAGERS.has(user.role)) {
      throw new ForbiddenException('Not authorized to view this invoice');
    }

    // Already settled, or never sent to Stripe: nothing to ask about.
    if (invoice.status !== InvoiceStatus.SENT || !invoice.stripeSessionId) {
      return this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: this.invoiceSelect,
      });
    }

    try {
      const session = await this.stripe.retrieveSession(invoice.stripeSessionId);
      if (session.payment_status === 'paid') {
        const paymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id;
        this.logger.log(
          `Invoice ${invoiceId} settled on return from Stripe (session ${invoice.stripeSessionId})`,
        );
        return await this.markPaid(invoiceId, paymentIntentId);
      }
    } catch (error) {
      // An unreachable Stripe must not fail the client's page. The invoice is
      // unchanged, and the webhook remains free to settle it.
      this.logger.error(
        `Could not verify invoice ${invoiceId} with Stripe`,
        error as Error,
      );
    }

    return this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: this.invoiceSelect,
    });
  }

  /**
   * The firm-wide invoice figures behind the Financial Summary.
   *
   * Cancelled invoices count for nothing. The two types are not symmetrical,
   * and that is the whole point of separating them:
   *
   *  - REIMBURSABLE_EXPENSE is a pass-through, not a sale. The firm fronts the
   *    money, so while the bill is outstanding it is out of pocket and the
   *    figure is negative; when the client repays, it returns to zero. The
   *    repayment is deliberately *not* counted as revenue — it is the firm's
   *    own money coming back, and booking it as income would turn a permit fee
   *    into profit.
   *
   *  - ADDITIONAL_SERVICE is a genuine sale: nothing was laid out, so there is
   *    no cost, and the amount becomes revenue the moment it is paid.
   *
   * Outstanding is judged against the end of the period, not against today. A
   * reimbursable raised and repaid inside the same year nets to zero within it;
   * one still unpaid at year end stood as a cost at year end, whatever has
   * happened since. Anything else would let a closed year's figures move.
   */
  async getInvoiceTotals(range?: { start: Date; end: Date }) {
    const withinRaised = range
      ? { createdAt: { gte: range.start, lte: range.end } }
      : {};
    const withinPaid = range
      ? { paidAt: { gte: range.start, lte: range.end } }
      : {};
    // Unsettled as at the end of the period being reported on.
    const unpaidAtPeriodEnd: Prisma.InvoiceWhereInput = range
      ? { OR: [{ paidAt: null }, { paidAt: { gt: range.end } }] }
      : { paidAt: null };

    const [billedRows, paidRows, outstandingReimbursableRows] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: { status: { not: InvoiceStatus.CANCELLED }, ...withinRaised },
          select: { amount: true, type: true },
        }),
        this.prisma.invoice.findMany({
          where: { status: InvoiceStatus.PAID, ...withinPaid },
          select: { amount: true, type: true },
        }),
        this.prisma.invoice.findMany({
          where: {
            status: { not: InvoiceStatus.CANCELLED },
            type: InvoiceType.REIMBURSABLE_EXPENSE,
            ...withinRaised,
            ...unpaidAtPeriodEnd,
          },
          select: { amount: true },
        }),
      ]);

    const sum = (rows: { amount: Prisma.Decimal }[]) =>
      rows.reduce((total, row) => total + Number(row.amount || 0), 0);

    const billed = sum(billedRows);
    const clientPaid = sum(paidRows);

    // What the firm is still out of pocket by. Shown under Cost as its own
    // line, and it returns to zero of its own accord once the client repays —
    // no reversing entry, the row simply stops matching.
    const reimbursableCost = sum(outstandingReimbursableRows);

    // The only part of invoicing that is income. Reimbursable repayments are
    // excluded on purpose: see above.
    const revenue = sum(
      paidRows.filter((r) => r.type === InvoiceType.ADDITIONAL_SERVICE),
    );

    return {
      billed,
      clientPaid,
      revenue,
      reimbursableCost,
      outstanding: billed - clientPaid,
      byType: {
        reimbursable: {
          billed: sum(
            billedRows.filter(
              (r) => r.type === InvoiceType.REIMBURSABLE_EXPENSE,
            ),
          ),
          clientPaid: sum(
            paidRows.filter((r) => r.type === InvoiceType.REIMBURSABLE_EXPENSE),
          ),
        },
        additionalService: {
          billed: sum(
            billedRows.filter((r) => r.type === InvoiceType.ADDITIONAL_SERVICE),
          ),
          clientPaid: sum(
            paidRows.filter((r) => r.type === InvoiceType.ADDITIONAL_SERVICE),
          ),
        },
      },
    };
  }
}
