import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { MercuryService } from './mercury.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { InvoiceModule } from '../project-manager/invoice/invoice.module';
import { SiteSettingsModule } from '../site-settings/site-settings.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    NotificationModule,
    InvoiceModule,
    SiteSettingsModule,
  ],
  controllers: [FinancialController],
  providers: [FinancialService, MercuryService],
  exports: [FinancialService, MercuryService],
})
export class FinancialModule {}
