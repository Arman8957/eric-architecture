// modules/upload/strategies/cloudinary.strategy.ts
import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { FileOptimizerService } from 'src/utils/optimizer/file-optimizer.service';

@Injectable()
export class CloudinaryStrategy {
  private readonly logger = new Logger(CloudinaryStrategy.name);

  constructor(
    private config: ConfigService,
    private fileOptimizer: FileOptimizerService,
  ) {
    cloudinary.config({
      cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async upload(
    file: Express.Multer.File,
    folder: string = 'uploads',
    transformation?: any[],
  ): Promise<{
    url: string;
    publicId: string;
    originalFilename: string;
    size: number;
    format: string;
  }> {
    try {
      const optimizedBuffer = await this.fileOptimizer.optimizeImage(file.buffer, file.mimetype);

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'auto',
            transformation: [
              ...(transformation || []),
              { quality: 'auto', fetch_format: 'auto' },
            ],
          },
          (error: any, result?: UploadApiResponse) => {
            if (error) {
              this.logger.error(`Cloudinary upload failed: ${error.message}`);
              return reject(error);
            }

            // ← Critical fix: result is optional
            if (!result) {
              this.logger.error('Cloudinary upload succeeded but returned no result');
              return reject(new Error('Upload failed: No result from Cloudinary'));
            }

            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              originalFilename: file.originalname,
              size: result.bytes,
              format: result.format,
            });
          },
        );

        const stream = Readable.from(optimizedBuffer);
        stream.pipe(uploadStream);
      });
    } catch (error) {
      this.logger.error('Cloudinary upload error:', error);
      throw new Error(`Upload failed: ${(error as Error).message}`);
    }
  }

  async delete(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result.result === 'ok';
    } catch (error) {
      this.logger.error(`Cloudinary delete failed for ${publicId}:`, error);
      return false;
    }
  }

  async getSignedUrl(publicId: string, transformation?: any[]): Promise<string> {
    return cloudinary.url(publicId, {
      transformation: transformation || [],
      secure: true,
      sign_url: true, // Optional: for private assets
    });
  }
}