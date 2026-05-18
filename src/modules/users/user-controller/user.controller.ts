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
import * as client from '@prisma/client';
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
  role: client.UserRole;
}

@Controller('project-requests')
export class ProjectRequestController {
  constructor(
    private readonly projectRequestService: ProjectRequestService,
  ) {}


  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 10))
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateProjectRequestDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.create(dto, files, user.id);
  }


  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.projectRequestService.getStats(user.role);
  }


  @Get('my-requests')
  @UseGuards(JwtAuthGuard)
  async findMyRequests(
    @Query() query: QueryProjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.findMyRequests(user.id, query);
  }


  @Get('my-stats')
  @UseGuards(JwtAuthGuard)
  async getMyStats(@CurrentUser() user: AuthenticatedUser) {
    return this.projectRequestService.getMyStats(user.id);
  }


  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query() query: QueryProjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // If user is regular USER role, redirect to their own requests
    if (user.role === client.UserRole.USER) {
      return this.projectRequestService.findMyRequests(user.id, query);
    }
    
    // Staff can see all requests
    return this.projectRequestService.findAll(query, user.role);
  }


  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.findOne(id, user.id, user.role);
  }


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


  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateProjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.update(id, updateDto, user.id, user.role);
  }


  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.softDelete(id, user.id, user.role);
  }


@Get('user-my-requests')
  @UseGuards(JwtAuthGuard)
  async findAllForUser(
    @Query() query: QueryProjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.findAllForUser(user.id, query);
  }

  // ─── Get single my request ───────────────────────────────────────────
  @Get(':id/user')
  @UseGuards(JwtAuthGuard)
  async findOneForUser(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.findOneForUser(id, user.id);
  }

  // ─── Update my request ───────────────────────────────────────────────
  @Patch(':id/user')
  @UseGuards(JwtAuthGuard)
  async updateForUser(
    @Param('id') id: string,
    @Body() dto: UpdateProjectRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.updateForUser(id, dto, user.id);
  }

  // ─── My stats ────────────────────────────────────────────────────────
  @Get('user-my-stats')
  @UseGuards(JwtAuthGuard)
  async getMyStatsUser(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectRequestService.getStatsForUser(user.id);
  }
}


