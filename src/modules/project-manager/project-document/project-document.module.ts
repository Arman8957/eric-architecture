import { Module } from '@nestjs/common';
import { ProjectDocumentService } from './project-document.service';
import { ProjectDocumentController } from './project-document.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CloudinaryStrategy } from 'src/upload/strategies/cloudinary.strategy';
import { FileOptimizerService } from 'src/utils/optimizer/file-optimizer.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProjectDocumentController],
  providers: [ProjectDocumentService, CloudinaryStrategy, FileOptimizerService],
  exports: [ProjectDocumentService],
})
export class ProjectDocumentModule {}
