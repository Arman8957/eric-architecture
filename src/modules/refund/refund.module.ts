import { Module } from '@nestjs/common';
import { RefundController } from './refund.controller';
import { RefundService } from './refund.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { MailerModule } from 'src/utils/email/email.module';

@Module({
  imports: [PrismaModule, NotificationModule, MailerModule],
  controllers: [RefundController],
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundModule {}
