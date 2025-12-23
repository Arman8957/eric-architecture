import { Module } from '@nestjs/common';
import { ProjectRequestService } from './user-service/project-request.service';

import { PrismaModule } from '../../prisma/prisma.module';
import { ProjectRequestController } from './user-controller/user.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectRequestController],
  providers: [ProjectRequestService],
  exports: [ProjectRequestService],
})
export class ProjectRequestModule {}