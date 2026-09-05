import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as client from '@prisma/client';
import { ProjectDocumentService } from './project-document.service';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('project-requests-admin')
@UseGuards(JwtAuthGuard)
export class ProjectDocumentController {
  constructor(private readonly documentService: ProjectDocumentService) {}

  @Get(':id/documents')
  getForProject(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.documentService.getForProject(id, user);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id') id: string,
    @Body('kind') kind: client.ProjectDocumentKind,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: client.User,
  ) {
    return this.documentService.upload(id, kind, file, user);
  }

  @Delete('documents/:documentId')
  remove(
    @Param('documentId') documentId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.documentService.remove(documentId, user);
  }
}
