import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  HttpStatus,
  HttpException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ParseFilePipeBuilder } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MediaService } from './media.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreateMediaContentDto } from './dto/create-media-content.dto';
import { UpdateMediaContentDto } from './dto/update-media-content.dto';
import { MediaQueryDto } from './dto/media-query.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { MediaRoles } from 'src/common/constant/roles.constant';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MediaRoles)
  async create(
    @Body() dto: CreateMediaContentDto,
    @CurrentUser() user: client.User,
  ) {
    console.log('[MediaController] create - Current user:', user);
    console.log('[MediaController] create - User role:', user.role);

    try {
      const created = await this.mediaService.create(dto, user.id, user.role);
      return {
        status: 'success',
        message: 'Media content created successfully (status: DRAFT)',
        data: created,
      };
    } catch (error) {
      console.error('[MediaController] create - Error:', error);
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        { status: 'error', message: 'Failed to create media content' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/assets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MediaRoles)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async uploadAssets(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: client.User,
  ) {
    if (!files || files.length === 0) {
      throw new HttpException(
        { status: 'error', message: 'At least one file is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Manual validation
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/avi',
      'video/quicktime',
      'application/pdf',
    ];

    for (const file of files) {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new HttpException(
          {
            status: 'error',
            message: `File type ${file.mimetype} is not allowed. Only images, videos, and PDFs are accepted.`,
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    try {
      const result = await this.mediaService.addAssets(
        id,
        files,
        user.id,
        user.role,
      );

      return {
        status: 'success',
        message: `Successfully uploaded ${result.count} asset(s)`,
        data: result.assets,
        totalUploaded: result.count,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new HttpException(
        { status: 'error', message: 'Failed to upload assets' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  async findAll(@Query() query: MediaQueryDto) {
    try {
      const result = await this.mediaService.findAll({
        type: query.type,
        status: query.status,
        featured: query.featured === 'true',
        country: query.country,
        category: query.category,
        page: query.page ?? 1,
        limit: query.limit ?? 12,
      });

      return {
        status: 'success',
        message: `Found ${result.data.length} media items`,
        data: result.data,
        pagination: result.pagination,
      };
    } catch (error) {
      throw new HttpException(
        { status: 'error', message: 'Failed to fetch media items' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('featured')
  async getFeatured() {
    try {
      const featured = await this.mediaService.getFeatured(8);

      return {
        status: 'success',
        message: `Found ${featured.length} featured media items`,
        data: featured,
      };
    } catch (error) {
      throw new HttpException(
        { status: 'error', message: 'Failed to fetch featured items' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string) {
    try {
      const item = await this.mediaService.findBySlug(slug);

      return {
        status: 'success',
        message: 'Media content retrieved successfully',
        data: item,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          {
            status: 'error',
            message: 'Media content not found or not published',
          },
          HttpStatus.NOT_FOUND,
        );
      }
      if (error instanceof BadRequestException) {
        throw new HttpException(
          { status: 'error', message: error.message },
          HttpStatus.BAD_REQUEST,
        );
      }
      throw new HttpException(
        { status: 'error', message: 'Failed to retrieve media content' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MediaRoles)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaContentDto,
    @CurrentUser() user: client.User,
  ) {
    try {
      const updated = await this.mediaService.update(
        id,
        dto,
        user.id,
        user.role,
      );

      return {
        status: 'success',
        message: 'Media content updated successfully',
        data: updated,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          { status: 'error', message: 'Media content not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      throw new HttpException(
        { status: 'error', message: 'Failed to update media content' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MediaRoles)
  async remove(@Param('id') id: string, @CurrentUser() user: client.User) {
    try {
      await this.mediaService.delete(id, user.id, user.role);

      return {
        status: 'success',
        message: 'Media content and all associated assets deleted successfully',
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new HttpException(
          { status: 'error', message: 'Media content not found' },
          HttpStatus.NOT_FOUND,
        );
      }
      throw new HttpException(
        { status: 'error', message: 'Failed to delete media content' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
