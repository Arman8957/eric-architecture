import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { InvoiceController } from './invoice.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { StripeService } from 'src/modules/payment/stripe.service';

/**
 * Exported because the financial dashboard reads the same totals — Gross
 * Revenue counts what clients have paid against invoices, and costs carry the
 * reimbursable outlay. Both come from getInvoiceTotals rather than being
 * recalculated there, so the two can never drift apart.
 */
/**
 * StripeService is provided here rather than imported from PaymentModule.
 * PaymentModule has to import *this* one so its webhook can settle invoices,
 * and importing it back would close the circle. The service is a stateless
 * wrapper over the Stripe SDK built from config, so a second instance costs
 * nothing and keeps the dependency running one way.
 */
@Module({
  imports: [PrismaModule, ConfigModule, NotificationModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, StripeService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
