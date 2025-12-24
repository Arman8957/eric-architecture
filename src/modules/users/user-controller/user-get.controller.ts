// src/modules/users/users.controller.ts
import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client'; // ← import directly
import { UsersGetService } from '../user-service/user-get.service';
import { SafeUser } from '../types/user.type';

interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: any;
}

@Controller('users')
export class UsersGetController {
  constructor(private readonly usersService: UsersGetService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.HIGHER_MANAGER,
    client.UserRole.PROJECT_MANAGER,
  )
  async listUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('role') role?: client.UserRole,
    @Query('search') search?: string,
    @Query('cursor') cursor?: string,
  ): Promise<ApiResponse<any>> {
    const pageNum = Math.max(1, parseInt(page, 10));
    const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const result = await this.usersService.listUsers({
      page: pageNum,
      take,
      roleFilter: role,
      search,
      cursor,
    });

    return {
      success: true,
      message:
        result.data.length > 0
          ? 'Users retrieved successfully'
          : 'No users found',
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: client.User) {
    return {
      success: true,
      message: 'Current user profile retrieved successfully',
      data: await this.usersService.getSafeUser(user.id),
    };
  }
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getUserById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: client.User,
  ) {
    const targetUser = await this.usersService.findById(id);

    const canSeeFullDetails =
      currentUser.id === targetUser.id ||
      currentUser.role === client.UserRole.SUPER_ADMIN ||
      currentUser.role === client.UserRole.ADMIN;

    return canSeeFullDetails
      ? targetUser
      : this.usersService.getPublicUser(targetUser);
  }

  // ───────────────────────────────────────────────
  // Quick role-based access endpoints
  // ───────────────────────────────────────────────

  @Get('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
  async getAdmins(): Promise<ApiResponse<SafeUser[]>> {
    const admins = await this.usersService.findByRole(client.UserRole.ADMIN);
    return {
      success: true,
      message:
        admins.length > 0 ? 'Admins retrieved successfully' : 'No admins found',
      data: admins,
    };
  }

  @Get('project-managers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.HIGHER_MANAGER,
    client.UserRole.PROJECT_MANAGER,
  )
  async getProjectManagers(): Promise<ApiResponse<SafeUser[]>> {
    const managers = await this.usersService.findByRole(
      client.UserRole.PROJECT_MANAGER,
    );
    return {
      success: true,
      message:
        managers.length > 0
          ? 'Project managers retrieved successfully'
          : 'No project managers found',
      data: managers,
    };
  }

  @Get('employees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.HIGHER_MANAGER,
    client.UserRole.PROJECT_MANAGER,
  )
  async getEmployees(): Promise<ApiResponse<SafeUser[]>> {
    const employees = await this.usersService.findByRole(
      client.UserRole.EMPLOYEE,
    );
    return {
      success: true,
      message:
        employees.length > 0
          ? 'Employees retrieved successfully'
          : 'No employees found',
      data: employees,
    };
  }

  @Get('drafters')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  async getDrafters(): Promise<ApiResponse<SafeUser[]>> {
    const drafters = await this.usersService.findByRole(
      client.UserRole.DRAFTER,
    );
    return {
      success: true,
      message:
        drafters.length > 0
          ? 'Drafters retrieved successfully'
          : 'No drafters found',
      data: drafters,
    };
  }

  @Get('media-managers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
  async getMediaManagers(): Promise<ApiResponse<SafeUser[]>> {
    const mediaManagers = await this.usersService.findByRole(
      client.UserRole.MEDIA_MANAGER,
    );
    return {
      success: true,
      message:
        mediaManagers.length > 0
          ? 'Media managers retrieved successfully'
          : 'No media managers found',
      data: mediaManagers,
    };
  }
}
