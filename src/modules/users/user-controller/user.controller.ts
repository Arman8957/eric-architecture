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
  ParseUUIDPipe,
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
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UsersGetService } from '../user-service/user-get.service';

interface AuthenticatedUser {
  id: string;
  email: string;
  role: client.UserRole;
}

@Controller('project-requests')
export class ProjectRequestController {
  constructor(
    private readonly projectRequestService: ProjectRequestService,
    private readonly usersGetService: UsersGetService,
  ) {}

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
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
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
  async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
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

  //////////////////////////////all get api's

  // @Get("users")
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(
  //   client.UserRole.SUPER_ADMIN,
  //   client.UserRole.ADMIN,
  //   client.UserRole.HIGHER_MANAGER,
  //   client.UserRole.PROJECT_MANAGER,
  // )
  // async listUsers(
  //   @Query('page') page = '1',
  //   @Query('limit') limit = '20',
  //   @Query('role') role?: client.UserRole,
  //   @Query('search') search?: string,
  //   @Query('cursor') cursor?: string,
  // ) {
  //   const pageNum = Math.max(1, parseInt(page, 10));
  //   const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

  //   return this.usersGetService.listUsers({
  //     page: pageNum,
  //     take,
  //     roleFilter: role,
  //     search,
  //     cursor,
  //   });
  // }

  // /**
  //  * Get current authenticated user's profile
  //  */
  // @Get('me')
  // @UseGuards(JwtAuthGuard)
  // async getMe(@CurrentUser() user: client.User) {
  //   return this.usersGetService.getSafeUser(user.id);
  // }

  // /**
  //  * Get single user by ID - different visibility based on requester's role
  //  */
  // @Get(':id')
  // @UseGuards(JwtAuthGuard)
  // async getUserById(
  //   @Param('id', ParseUUIDPipe) id: string,
  //   @CurrentUser() currentUser: client.User,
  // ) {
  //   const targetUser = await this.usersGetService.findById(id);

  //   const canSeeFullDetails =
  //     currentUser.id === targetUser.id ||
  //     currentUser.role === client.UserRole.SUPER_ADMIN ||
  //     currentUser.role === client.UserRole.ADMIN;

  //   return canSeeFullDetails
  //     ? targetUser
  //     : this.usersGetService.getPublicUser(targetUser);
  // }

  // // ───────────────────────────────────────────────
  // // Quick access endpoints for specific roles
  // // ───────────────────────────────────────────────

  // @Get('admins')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
  // async getAdmins() {
  //   return this.usersGetService.findByRole(client.UserRole.ADMIN);
  // }

  // @Get('project-managers')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(
  //   client.UserRole.SUPER_ADMIN,
  //   client.UserRole.ADMIN,
  //   client.UserRole.HIGHER_MANAGER,
  //   client.UserRole.PROJECT_MANAGER,
  // )
  // async getProjectManagers() {
  //   return this.usersGetService.findByRole(client.UserRole.PROJECT_MANAGER);
  // }

  // @Get('employees')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(
  //   client.UserRole.SUPER_ADMIN,
  //   client.UserRole.ADMIN,
  //   client.UserRole.HIGHER_MANAGER,
  //   client.UserRole.PROJECT_MANAGER,
  // )
  // async getEmployees() {
  //   return this.usersGetService.findByRole(client.UserRole.EMPLOYEE);
  // }

  // @Get('drafters')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  // async getDrafters() {
  //   return this.usersGetService.findByRole(client.UserRole.DRAFTER);
  // }

  // @Get('media-managers')
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
  // async getMediaManagers() {
  //   return this.usersGetService.findByRole(client.UserRole.MEDIA_MANAGER);
  // }
}
