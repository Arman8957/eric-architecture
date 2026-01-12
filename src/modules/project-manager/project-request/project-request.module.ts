import { Module } from '@nestjs/common';
import { ProjectRequestService } from './project-request.service';
import { ProjectRequestController } from './project-request.controller';
import { MailerModule } from 'src/utils/email/email.module';
import { PrismaModule } from 'src/prisma/prisma.module';


@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [ProjectRequestController],
  providers: [ProjectRequestService],
  exports: [ProjectRequestService],
})
export class ProjectRequestModule {}