// utils/file-optimizer.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as ffmpeg from 'fluent-ffmpeg';

@Injectable()
export class FileOptimizerService {
  private readonly logger = new Logger(FileOptimizerService.name);

  async optimizeImage(buffer: Buffer, mimetype: string): Promise<Buffer> {
    try {
      if (!buffer || !mimetype) {
        throw new BadRequestException('Invalid file buffer or mimetype');
      }

      // Only optimize images
      if (!mimetype.startsWith('image/')) {
        return buffer; // Return original for non-images
      }

      const optimized = await sharp(buffer)
        .resize(1920, 1080, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ 
          quality: 85, 
          mozjpeg: true 
        })
        .toBuffer();

      this.logger.log(`Image optimized: ${buffer.length}B → ${optimized.length}B`);
      return optimized;
    } catch (error) {
      this.logger.error('Image optimization failed:', error);
      throw new BadRequestException('Failed to process image');
    }
  }

  async optimizeVideo(buffer: Buffer, mimetype: string): Promise<Buffer> {
    // For video optimization, you'd typically save to temp file and process
    // This is a simplified version - implement based on your needs
    return buffer;
  }
}