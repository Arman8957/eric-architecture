import { Module } from '@nestjs/common';
import { ProjectRequestService } from './user-service/project-request.service';

import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectRequestController } from './user-controller/user.controller';
import { UsersGetService } from './user-service/user-get.service';
import { UsersGetController } from './user-controller/user-get.controller';
import { NotificationModule } from '../notification/notification.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [PrismaModule, NotificationModule, PaymentModule],
  controllers: [ProjectRequestController, UsersGetController],
  providers: [ProjectRequestService, UsersGetService ],
  exports: [ProjectRequestService, UsersGetService],
})
export class ProjectRequestModule {}