import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';

import { UserRole } from '@prisma/client';
import { ProjectRequestService } from '../user-service/project-request.service';
import { CreateProjectRequestDto } from '../dto/project-request.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { QueryProjectRequestDto } from '../dto/query-project-request.dto';
import { UpdateProjectRequestDto } from '../dto/update-project-request.dto';
import { Public } from 'src/common/decorators/public.decorator';


interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}

@Controller('project-requests')
export class ProjectRequestController {
  constructor(private readonly projectRequestService: ProjectRequestService) {}

  /**
   * Create new project request - Public endpoint
   */
  // @Post()
  // @Public() // if you have public decorator, otherwise remove guard
  // @HttpCode(HttpStatus.CREATED)
  // async create(
  //   @Body() createDto: CreateProjectRequestDto,
  //   @CurrentUser() user?: AuthenticatedUser,
  // ) {
  //   return this.projectRequestService.create(createDto, user?.id);
  // }

@Post()
@Public()
@UseInterceptors(FilesInterceptor('files', 10)) // allow up to 10 files
@HttpCode(HttpStatus.CREATED)
async create(
  @Body() dto: CreateProjectRequestDto,
  @UploadedFiles() files: Express.Multer.File[] = [],
  @CurrentUser() user?: AuthenticatedUser,
) {
  return this.projectRequestService.create(dto, files, user?.id);
}

  /**
   * Upload file/document to existing request
   */
  @Post(':id/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.uploadFile(id, file, user.id, user.role);
  }

  /**
   * Get all project requests (Staff/Admin only)
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: QueryProjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.findAll(query, user.role);
  }

  /**
   * Get my own project requests
   */
  @Get('my-requests')
  @UseGuards(JwtAuthGuard)
  async findMyRequests(
    @Query() query: QueryProjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.findMyRequests(user.id, query);
  }

  /**
   * Get single project request
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectRequestService.findOne(id, user.id, user.role);
  }

  /**
   * Update project request
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateProjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.update(id, updateDto, user.id, user.role);
  }

  /**
   * Soft delete project request
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectRequestService.softDelete(id, user.id, user.role);
  }

  /**
   * Get basic statistics (Admin/Staff only)
   */
  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.projectRequestService.getStats(user.role);
  }
}