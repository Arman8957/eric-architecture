import { Module } from '@nestjs/common';
import { ProjectAttachmentService } from './project-attachment.service';
import { ProjectAttachmentController } from './project-attachment.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectAttachmentController],
  providers: [ProjectAttachmentService],
  exports: [ProjectAttachmentService],
})
export class ProjectAttachmentModule {}
