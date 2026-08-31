import { Module } from '@nestjs/common';
import { ConsultationRefundController } from './consultation-refund.controller';
import { ConsultationRefundService } from './consultation-refund.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PrismaModule, NotificationModule, PaymentModule],
  controllers: [ConsultationRefundController],
  providers: [ConsultationRefundService],
  exports: [ConsultationRefundService],
})
export class ConsultationRefundModule {}
