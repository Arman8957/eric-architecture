import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryStrategy } from 'src/upload/strategies/cloudinary.strategy';
import { FileOptimizerService } from 'src/utils/optimizer/file-optimizer.service';


@Module({
  controllers: [MediaController],
  providers: [
    MediaService,
    PrismaService,
    CloudinaryStrategy,
    FileOptimizerService,
  ],
  exports: [MediaService],
})
export class MediaModule {}