
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { FileOptimizerService } from 'src/utils/optimizer/file-optimizer.service';

interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  originalFilename: string;
  size: number;
  format: string;
  width?: number;
  height?: number;
  resourceType: string;
}

@Injectable()
export class CloudinaryStrategy {
  private readonly logger = new Logger(CloudinaryStrategy.name);

  constructor(
    private config: ConfigService,
    private fileOptimizer: FileOptimizerService,
  ) {
    this.initializeCloudinary();
  }

  private initializeCloudinary() {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.error('Cloudinary credentials are missing');
      throw new Error('Cloudinary configuration is incomplete');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });

    this.logger.log('Cloudinary initialized successfully');
  }

  /**
   * Upload file to Cloudinary
   * @param file - Multer file object
   * @param folder - Cloudinary folder path
   * @param transformation - Optional transformations
   * @returns Upload result with URL and metadata
   */
  async upload(
    file: Express.Multer.File,
    folder: string = 'uploads',
    transformation?: any[],
  ): Promise<CloudinaryUploadResult> {
    try {
      // Validate file
      if (!file || !file.buffer) {
        throw new BadRequestException('Invalid file: no buffer found');
      }

      // Optimize image if it's an image file
      let bufferToUpload = file.buffer;
      
      if (this.isImage(file.mimetype)) {
        try {
          bufferToUpload = await this.fileOptimizer.optimizeImage(
            file.buffer,
            file.mimetype,
          );
          this.logger.log(`Image optimized: ${file.originalname}`);
        } catch (optimizationError) {
          this.logger.warn(
            `Image optimization failed, using original: ${optimizationError}`,
          );
          bufferToUpload = file.buffer;
        }
      }

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: 'auto',
            transformation: [
              ...(transformation || []),
              { quality: 'auto', fetch_format: 'auto' },
            ],
            // Add useful metadata
            context: {
              originalname: file.originalname,
              mimetype: file.mimetype,
            },
          },
          (error: any, result?: UploadApiResponse) => {
            if (error) {
              // FIX 1: Correct template literal syntax
              this.logger.error(
                `Cloudinary upload failed: ${error.message}`,
              );
              return reject(
                new Error(`Cloudinary upload error: ${error.message}`),
              );
            }

            // FIX 2: Proper null check for result
            if (!result) {
              this.logger.error(
                'Cloudinary upload succeeded but returned no result',
              );
              return reject(
                new Error('Upload failed: No result from Cloudinary'),
              );
            }

            this.logger.log(
              `File uploaded successfully: ${result.public_id}`,
            );

            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              originalFilename: file.originalname,
              size: result.bytes,
              format: result.format,
              width: result.width,
              height: result.height,
              resourceType: result.resource_type,
            });
          },
        );

        // Create readable stream from buffer
        const stream = Readable.from(bufferToUpload);
        stream.pipe(uploadStream);

        // Handle stream errors
        stream.on('error', (streamError) => {
          this.logger.error('Stream error:', streamError);
          reject(new Error(`Stream error: ${streamError.message}`));
        });
      });
    } catch (error) {
      this.logger.error('Cloudinary upload error:', error);
      // FIX 3: Correct template literal syntax
      throw new Error(`Upload failed: ${(error as Error).message}`);
    }
  }

  /**
   * Upload multiple files to Cloudinary
   * @param files - Array of Multer files
   * @param folder - Cloudinary folder path
   * @returns Array of upload results
   */
  async uploadMultiple(
    files: Express.Multer.File[],
    folder: string = 'uploads',
  ): Promise<CloudinaryUploadResult[]> {
    try {
      const uploadPromises = files.map((file) =>
        this.upload(file, folder),
      );
      return await Promise.all(uploadPromises);
    } catch (error) {
      this.logger.error('Multiple upload error:', error);
      throw new Error(`Multiple upload failed: ${(error as Error).message}`);
    }
  }

  /**
   * Delete file from Cloudinary
   * @param publicId - Cloudinary public ID
   * @returns Success boolean
   */
  async delete(publicId: string): Promise<boolean> {
    try {
      if (!publicId) {
        this.logger.warn('Delete called with empty publicId');
        return false;
      }

      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        this.logger.log(`File deleted successfully: ${publicId}`);
        return true;
      } else if (result.result === 'not found') {
        this.logger.warn(`File not found for deletion: ${publicId}`);
        return false;
      } else {
        this.logger.error(
          `Unexpected delete result for ${publicId}: ${result.result}`,
        );
        return false;
      }
    } catch (error) {
      // FIX 4: Correct template literal syntax
      this.logger.error(
        `Cloudinary delete failed for ${publicId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Delete multiple files from Cloudinary
   * @param publicIds - Array of Cloudinary public IDs
   * @returns Number of successfully deleted files
   */
  async deleteMultiple(publicIds: string[]): Promise<number> {
    try {
      const deletePromises = publicIds.map((id) => this.delete(id));
      const results = await Promise.all(deletePromises);
      const successCount = results.filter((success) => success).length;
      
      this.logger.log(
        `Deleted ${successCount}/${publicIds.length} files`,
      );
      
      return successCount;
    } catch (error) {
      this.logger.error('Multiple delete error:', error);
      return 0;
    }
  }

  /**
   * Get signed URL for a Cloudinary asset
   * @param publicId - Cloudinary public ID
   * @param transformation - Optional transformations
   * @returns Signed URL
   */
  async getSignedUrl(
    publicId: string,
    transformation?: any[],
  ): Promise<string> {
    try {
      if (!publicId) {
        throw new BadRequestException('Public ID is required');
      }

      return cloudinary.url(publicId, {
        transformation: transformation || [],
        secure: true,
        sign_url: true, // For private assets
      });
    } catch (error) {
      this.logger.error('Failed to generate signed URL:', error);
      throw new Error(
        `Failed to generate signed URL: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Get optimized URL with transformations
   * @param publicId - Cloudinary public ID
   * @param options - Transformation options
   * @returns Transformed URL
   */
  getOptimizedUrl(
    publicId: string,
    options?: {
      width?: number;
      height?: number;
      crop?: string;
      quality?: string | number;
      format?: string;
    },
  ): string {
    const transformation: any = {
      quality: options?.quality || 'auto',
      fetch_format: options?.format || 'auto',
    };

    if (options?.width) transformation.width = options.width;
    if (options?.height) transformation.height = options.height;
    if (options?.crop) transformation.crop = options.crop;

    return cloudinary.url(publicId, {
      transformation,
      secure: true,
    });
  }

  /**
   * Get thumbnail URL
   * @param publicId - Cloudinary public ID
   * @param size - Thumbnail size (default: 150)
   * @returns Thumbnail URL
   */
  getThumbnailUrl(publicId: string, size: number = 150): string {
    return this.getOptimizedUrl(publicId, {
      width: size,
      height: size,
      crop: 'fill',
      quality: 'auto',
    });
  }

  /**
   * Check if file is an image
   * @param mimetype - File MIME type
   * @returns True if image
   */
  private isImage(mimetype: string): boolean {
    return mimetype.startsWith('image/');
  }

  /**
   * Get asset info from Cloudinary
   * @param publicId - Cloudinary public ID
   * @returns Asset metadata
   */
  async getAssetInfo(publicId: string): Promise<any> {
    try {
      const result = await cloudinary.api.resource(publicId);
      return result;
    } catch (error) {
      this.logger.error(`Failed to get asset info for ${publicId}:`, error);
      throw new Error(
        `Failed to get asset info: ${(error as Error).message}`,
      );
    }
  }

  /**
   * List all assets in a folder
   * @param folder - Folder path
   * @param maxResults - Maximum results (default: 100)
   * @returns List of assets
   */
  async listAssets(folder: string, maxResults: number = 100): Promise<any[]> {
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: folder,
        max_results: maxResults,
      });
      return result.resources;
    } catch (error) {
      this.logger.error(`Failed to list assets in ${folder}:`, error);
      throw new Error(
        `Failed to list assets: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Create a folder in Cloudinary
   * @param folderPath - Folder path to create
   * @returns Success boolean
   */
  async createFolder(folderPath: string): Promise<boolean> {
    try {
      await cloudinary.api.create_folder(folderPath);
      this.logger.log(`Folder created: ${folderPath}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to create folder ${folderPath}:`, error);
      return false;
    }
  }

  /**
   * Delete a folder from Cloudinary
   * @param folderPath - Folder path to delete
   * @returns Success boolean
   */
  async deleteFolder(folderPath: string): Promise<boolean> {
    try {
      await cloudinary.api.delete_folder(folderPath);
      this.logger.log(`Folder deleted: ${folderPath}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete folder ${folderPath}:`, error);
      return false;
    }
  }
}


// // modules/upload/strategies/cloudinary.strategy.ts
// import { Injectable, Logger } from '@nestjs/common';
// import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
// import { ConfigService } from '@nestjs/config';
// import { Readable } from 'stream';
// import { FileOptimizerService } from 'src/utils/optimizer/file-optimizer.service';

// @Injectable()
// export class CloudinaryStrategy {
//   private readonly logger = new Logger(CloudinaryStrategy.name);

//   constructor(
//     private config: ConfigService,
//     private fileOptimizer: FileOptimizerService,
//   ) {
//     cloudinary.config({
//       cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
//       api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
//       api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
//     });
//   }

//   async upload(
//     file: Express.Multer.File,
//     folder: string = 'uploads',
//     transformation?: any[],
//   ): Promise<{
//     url: string;
//     publicId: string;
//     originalFilename: string;
//     size: number;
//     format: string;
//   }> {
//     try {
//       const optimizedBuffer = await this.fileOptimizer.optimizeImage(file.buffer, file.mimetype);

//       return new Promise((resolve, reject) => {
//         const uploadStream = cloudinary.uploader.upload_stream(
//           {
//             folder,
//             resource_type: 'auto',
//             transformation: [
//               ...(transformation || []),
//               { quality: 'auto', fetch_format: 'auto' },
//             ],
//           },
//           (error: any, result?: UploadApiResponse) => {
//             if (error) {
//               this.logger.error(`Cloudinary upload failed: ${error.message}`);
//               return reject(error);
//             }

//             // ← Critical fix: result is optional
//             if (!result) {
//               this.logger.error('Cloudinary upload succeeded but returned no result');
//               return reject(new Error('Upload failed: No result from Cloudinary'));
//             }

//             resolve({
//               url: result.secure_url,
//               publicId: result.public_id,
//               originalFilename: file.originalname,
//               size: result.bytes,
//               format: result.format,
//             });
//           },
//         );

//         const stream = Readable.from(optimizedBuffer);
//         stream.pipe(uploadStream);
//       });
//     } catch (error) {
//       this.logger.error('Cloudinary upload error:', error);
//       throw new Error(`Upload failed: ${(error as Error).message}`);
//     }
//   }

//   async delete(publicId: string): Promise<boolean> {
//     try {
//       const result = await cloudinary.uploader.destroy(publicId);
//       return result.result === 'ok';
//     } catch (error) {
//       this.logger.error(`Cloudinary delete failed for ${publicId}:`, error);
//       return false;
//     }
//   }

//   async getSignedUrl(publicId: string, transformation?: any[]): Promise<string> {
//     return cloudinary.url(publicId, {
//       transformation: transformation || [],
//       secure: true,
//       sign_url: true, // Optional: for private assets
//     });
//   }
// }