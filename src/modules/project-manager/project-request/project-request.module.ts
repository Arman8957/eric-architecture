import { Module } from '@nestjs/common';
import { ProjectRequestService } from './project-request.service';
import { ProjectRequestController } from './project-request.controller';
import { MailerModule } from 'src/utils/email/email.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { PaymentModule } from 'src/modules/payment/payment.module';


@Module({
  imports: [PrismaModule, MailerModule, NotificationModule, PaymentModule],
  controllers: [ProjectRequestController],
  providers: [ProjectRequestService],
  exports: [ProjectRequestService],
})
export class ProjectAdminRequestModule {}