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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ParseFilePipeBuilder } from '@nestjs/common';
import * as client from '@prisma/client';
import { MediaService } from './media.service';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreateMediaContentDto } from './dto/create-media-content.dto';
import { MediaQueryDto } from './dto/media-query.dto';
import { UpdateMediaContentDto } from './dto/update-media-content.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';


@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.MEDIA_MANAGER, client.UserRole.ADMIN, client.UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateMediaContentDto, @CurrentUser() user: client.User) {
    return this.mediaService.create(dto, user.id, user.role);
  }

  @Post(':id/assets')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.MEDIA_MANAGER, client.UserRole.ADMIN, client.UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
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
        }),
    )
    files: Express.Multer.File[],
    @CurrentUser() user: client.User,
  ) {
    return this.mediaService.addAssets(id, files, user.id, user.role);
  }

@Get()
findAll(@Query() query: MediaQueryDto) {
  return this.mediaService.findAll({
    type: query.type,
    status: query.status,
    featured: query.featured === 'true',
    country: query.country,
    category: query.category,
    page: query.page ?? 1,     // safe default
    limit: query.limit ?? 12,  // safe default
  });
}
  @Get('featured')
  getFeatured() {
    return this.mediaService.getFeatured(8);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.mediaService.findBySlug(slug);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.MEDIA_MANAGER, client.UserRole.ADMIN, client.UserRole.SUPER_ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaContentDto,
    @CurrentUser() user: client.User,
  ) {
    return this.mediaService.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(client.UserRole.MEDIA_MANAGER, client.UserRole.ADMIN, client.UserRole.SUPER_ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.mediaService.delete(id, user.id, user.role);
  }
}