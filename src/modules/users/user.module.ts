import { Module } from '@nestjs/common';
import { ProjectRequestService } from './user-service/project-request.service';

import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectRequestController } from './user-controller/user.controller';
import { UsersGetService } from './user-service/user-get.service';
import { UsersGetController } from './user-controller/user-get.controller';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';
import { CloudinaryStrategy } from 'src/upload/strategies/cloudinary.strategy';
import { FileOptimizerService } from 'src/utils/optimizer/file-optimizer.service';
import { MailerModule } from 'src/utils/email/email.module';

@Module({
  // MailerModule: the studio mailbox is emailed when a new inquiry arrives.
  imports: [PrismaModule, NotificationModule, PaymentModule, MailerModule],
  controllers: [ProjectRequestController, UsersGetController],
  providers: [
    ProjectRequestService,
    UsersGetService,
    CloudinaryStrategy,
    FileOptimizerService,
  ],
  exports: [ProjectRequestService, UsersGetService],
})
export class ProjectRequestModule {}