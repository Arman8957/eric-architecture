import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceService } from './invoice.service';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { CancelInvoiceDto, CreateInvoiceDto } from './dto/invoice.dto';

@Controller('projects/:projectId/invoices')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  private readonly frontendUrl: string;

  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly config: ConfigService,
  ) {
    // First origin only — FRONTEND_URL may list several.
    this.frontendUrl = (
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173'
    )
      .split(',')[0]
      .trim();
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: client.User,
  ) {
    const invoice = await this.invoiceService.create(projectId, dto, user);
    return {
      success: true,
      message: 'Invoice sent to client',
      data: invoice,
    };
  }

  /**
   * No @Roles: the client whose project this is has to see their own bills.
   * Staff visibility is settled by the dashboard's own section rules, and an
   * invoice carries no figure a project's client should not know.
   */
  @Get()
  async findAll(@Param('projectId') projectId: string) {
    const invoices = await this.invoiceService.findByProject(projectId);
    return { success: true, data: invoices };
  }

  /**
   * Opens Stripe checkout for an invoice.
   *
   * No @Roles: this is the client's own bill to settle. The service checks
   * that the caller either owns the project or is staff acting for them.
   */
  @Post(':invoiceId/checkout')
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @Param('projectId') projectId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: client.User,
  ) {
    const session = await this.invoiceService.createCheckoutSession(
      projectId,
      invoiceId,
      user,
      this.frontendUrl,
    );
    return { success: true, data: session };
  }

  /**
   * Settles an invoice the client has just paid, by checking with Stripe.
   *
   * The client lands back here from the checkout page; this is what makes the
   * bill read Paid without waiting on a webhook that may be slow, or — on a
   * developer's machine, which Stripe cannot call — never arrive. Safe to call
   * at any time and from either side: it only ever asks Stripe, and settling
   * is idempotent.
   *
   * No @Roles, for the same reason as checkout above: it is the client's own
   * bill, and the service checks they own the project.
   */
  @Post(':invoiceId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('projectId') projectId: string,
    @Param('invoiceId') invoiceId: string,
    @CurrentUser() user: client.User,
  ) {
    const invoice = await this.invoiceService.confirmPayment(
      projectId,
      invoiceId,
      user,
    );
    return { success: true, data: invoice };
  }

  /**
   * Cancelling a *paid* invoice narrows to SUPER_ADMIN inside the service —
   * the roles here are the outer gate, and the status decides the rest.
   */
  @Patch(':invoiceId/cancel')
  @UseGuards(RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('projectId') projectId: string,
    @Param('invoiceId') invoiceId: string,
    @Body() dto: CancelInvoiceDto,
    @CurrentUser() user: client.User,
  ) {
    const invoice = await this.invoiceService.cancel(
      projectId,
      invoiceId,
      dto.reason,
      user,
    );
    return {
      success: true,
      message: 'Invoice cancelled',
      data: invoice,
    };
  }
}
