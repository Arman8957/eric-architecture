import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ProjectStageService } from './project-stage.service';
import { ProjectStageController } from './project-stage.controller';
import { DeadlineReminderService } from './deadline-reminder.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from 'src/utils/email/email.module';
import { NotificationModule } from 'src/modules/notification/notification.module';


@Module({
  imports: [PrismaModule, MailerModule, NotificationModule, ScheduleModule],
  controllers: [ProjectStageController],
  providers: [ProjectStageService, DeadlineReminderService],
  exports: [ProjectStageService, DeadlineReminderService],
})
export class ProjectStageModule {}