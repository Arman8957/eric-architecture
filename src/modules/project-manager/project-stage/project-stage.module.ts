import { Module } from '@nestjs/common';
import { ProjectStageService } from './project-stage.service';
import { ProjectStageController } from './project-stage.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from 'src/utils/email/email.module';


@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [ProjectStageController],
  providers: [ProjectStageService],
  exports: [ProjectStageService],
})
export class ProjectStageModule {}