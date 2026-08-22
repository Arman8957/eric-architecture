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
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ParseFilePipeBuilder } from '@nestjs/common';

import { MediaService } from './media.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import {
  CreateMediaCommentDto,
  CreateMediaContentDto,
} from './dto/create-media-content.dto';
import { UpdateMediaContentDto } from './dto/update-media-content.dto';
import { MediaQueryDto } from './dto/media-query.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { MediaRoles } from 'src/common/constant/roles.constant';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { UserRole } from '@prisma/client';
import { JwtOptionalAuthGuard } from 'src/common/guards/optional-auth.guard';

// @UseGuards(JwtAuthGuard, RolesGuard)
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
    try {
      const created = await this.mediaService.create(dto, user.id, user.role);
      return {
        status: 'success',
        message: 'Media content created successfully (status: DRAFT)',
        data: created,
      };
    } catch (error) {
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
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
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

    // Manual mime type validation since ParseFilePipe is being flaky
    const allowedMimeTypes =
      /image\/(jpeg|png|webp|gif)|video\/mp4|application\/pdf/;
    for (const file of files) {
      if (!allowedMimeTypes.test(file.mimetype)) {
        throw new HttpException(
          {
            status: 'error',
            message: `Unsupported file type: ${file.mimetype}. Allowed types: images, mp4, and pdf.`,
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
  async findAll(
    @Query() query: MediaQueryDto,
    @CurrentUser() currentUser?: { id: string },
  ) {
    try {
      const result = await this.mediaService.findAll(
        {
          type: query.type,
          status: query.status,
          featured:
            query.featured === 'true'
              ? true
              : query.featured === 'false'
                ? false
                : undefined,
          country: query.country,
          category: query.category,
          page: query.page,
          limit: query.limit,
        },
        currentUser,
      );

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
  @UseGuards(JwtOptionalAuthGuard)
  async findOne(
    @Param('slug') slug: string,
    @CurrentUser() user?: client.User,
  ) {
    try {
      const item = await this.mediaService.findBySlug(
        slug,
        true,
        user?.id,
        user?.role,
      );

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

  @Delete(':id/assets/:assetId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...MediaRoles)
  async removeAsset(
    @Param('id') id: string,
    @Param('assetId') assetId: string,
    @CurrentUser() user: client.User,
  ) {
    try {
      const result = await this.mediaService.deleteAsset(
        id,
        assetId,
        user.id,
        user.role,
      );
      return { status: 'success', message: result.message };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      throw new HttpException(
        { status: 'error', message: 'Failed to remove image' },
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

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  async toggleLike(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.mediaService.toggleMediaLike(id, user.id);
  }

  @Get(':id/likes')
  async getLikesInfo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: client.User,
  ) {
    return this.mediaService.getMediaLikesInfo(id, user?.id);
  }



  @Get('admin/all-statuses')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEDIA_MANAGER)
  async findAllAnyStatus(
    @Query() query: MediaQueryDto,
    @CurrentUser() user: client.User,
  ) {
    const result = await this.mediaService.findAllAnyStatus(
      {
        type: query.type,
        status: query.status, // now fully respected
        featured:
          query.featured === 'true'
            ? true
            : query.featured === 'false'
              ? false
              : undefined,
        country: query.country,
        category: query.category,
        page: query.page ?? 1,
        limit: query.limit ?? 20, // usually bigger page size for admin
      },
      user.id,
    );

    return {
      status: 'success',
      message: `Found ${result.data.length} media items (any status)`,
      data: result.data,
      pagination: result.pagination,
    };
  }



  // ────────────── Comments ──────────────

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  async createComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMediaCommentDto,
    @CurrentUser() user: client.User,
  ) {
    return this.mediaService.createMediaComment(id, user.id, dto);
  }

  @Post(':id/comments/:parentId/reply')
  @UseGuards(JwtAuthGuard)
  async createReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Body() dto: CreateMediaCommentDto,
    @CurrentUser() user: client.User,
  ) {
    return this.mediaService.createMediaComment(id, user.id, {
      ...dto,
      parentId,
    });
  }



  @Get(':id/comments')
  async getComments(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('sort') sort: 'newest' | 'oldest' = 'newest',
  ) {
    return this.mediaService.getMediaComments(id, { page, limit, sort });
  }

  // Optional: Like comment
  @Post(':id/comments/:commentId/like')
  @UseGuards(JwtAuthGuard)
  async toggleCommentLike(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.mediaService.toggleCommentLike(commentId, user.id);
  }


}
