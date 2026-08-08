import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ProjectAttachmentService } from './project-attachment.service';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import * as client from '@prisma/client';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('project-requests-admin')
@UseGuards(JwtAuthGuard)
export class ProjectAttachmentController {
  constructor(private readonly attachmentService: ProjectAttachmentService) {}

  @Get(':id/attachments')
  getForProject(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.attachmentService.getForProject(id, user);
  }

  @Post(':id/attachments')
  create(
    @Param('id') id: string,
    @Body() body: { title: string; url: string },
    @CurrentUser() user: client.User,
  ) {
    return this.attachmentService.create(id, body, user);
  }

  @Patch('attachments/:attachmentId')
  update(
    @Param('attachmentId') attachmentId: string,
    @Body() body: { title?: string; url?: string },
    @CurrentUser() user: client.User,
  ) {
    return this.attachmentService.update(attachmentId, body, user);
  }

  @Delete('attachments/:attachmentId')
  remove(
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.attachmentService.remove(attachmentId, user);
  }
}
