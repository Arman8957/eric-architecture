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

      // Cap the *longest* edge, not both edges. `inside` against 1920x1080
      // fitted landscape photos to the 1080 height first, so a 3:2 shot came
      // out 1620px wide — below a retina phone's needs and well below a
      // desktop hero's, which is why full-bleed project photos looked soft.
      // 2560 keeps every project photo at or above the 2000-2400px the hero
      // asks for on large displays; Cloudinary scales it back down per device
      // at delivery, so this costs storage, not bandwidth.
      const optimized = await sharp(buffer)
        .resize(2560, 2560, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        // This buffer is the master every delivery render is derived from, and
        // Cloudinary re-encodes on top of it — so it is worth holding detail
        // here and letting `q_auto` do the compressing downstream.
        .jpeg({
          quality: 90,
          mozjpeg: true,
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