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
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
    }),
  )
  async uploadAssets(
    @Param('id') id: string,
    @UploadedFiles(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: /(image\/|video\/|application\/pdf)/,
        })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          fileIsRequired: true,
        }),
    )
    files: Express.Multer.File[],
    @CurrentUser() user: client.User,
  ) {
    if (files.length === 0) {
      throw new HttpException(
        { status: 'error', message: 'At least one file is required' },
        HttpStatus.BAD_REQUEST,
      );
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

  // @Get()
  // async findAll(@Query() query: MediaQueryDto) {
  //   try {
  //     const result = await this.mediaService.findAll({
  //       type: query.type,
  //       status: query.status,
  //       featured: query.featured === 'true',
  //       country: query.country,
  //       category: query.category,
  //       page: query.page ?? 1,
  //       limit: query.limit ?? 12,
  //     });

  //     return {
  //       status: 'success',
  //       message: `Found ${result.data.length} media items`,
  //       data: result.data,
  //       pagination: result.pagination,
  //     };
  //   } catch (error) {
  //     throw new HttpException(
  //       { status: 'error', message: 'Failed to fetch media items' },
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //     );
  //   }
  // }

@Get()
async findAll(
  @Query() query: MediaQueryDto,
  @CurrentUser() currentUser?: { id: string } // ← add this if not already
) {
  try {
    const result = await this.mediaService.findAll(
      {
        type: query.type,
        status: query.status,
        featured: query.featured === 'true' ? true : query.featured === 'false' ? false : undefined,
        country: query.country,
        category: query.category,
        page: query.page,
        limit: query.limit,
      },
      currentUser
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

  //   @Delete(':id/comments/:commentId')
  // @UseGuards(JwtAuthGuard)
  // async deleteComment(
  //   @Param('id', ParseUUIDPipe) mediaId: string,
  //   @Param('commentId', ParseUUIDPipe) commentId: string,
  //   @CurrentUser() user: User,
  // ) {
  //   return this.mediaService.deleteMediaComment(mediaId, commentId, user.id, user.role);
  // }

  // // Optional: Admin/Moderator force delete (no ownership check)
  // @Delete(':id/comments/:commentId/admin')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEDIA_MANAGER)
  // async adminDeleteComment(
  //   @Param('id', ParseUUIDPipe) mediaId: string,
  //   @Param('commentId', ParseUUIDPipe) commentId: string,
  //   @CurrentUser() user: User,
  // ) {
  //   return this.mediaService.deleteMediaComment(mediaId, commentId, user.id, user.role, true);
  // }
}
