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
  ) {
    const pageNum = Math.max(1, parseInt(page, 10));
    const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

    return this.usersService.listUsers({
      page: pageNum,
      take,
      roleFilter: role,
      search,
      cursor,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: client.User) {
    return this.usersService.getSafeUser(user.id);
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
  async getAdmins() {
    return this.usersService.findByRole(client.UserRole.ADMIN);
  }

  @Get('project-managers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.HIGHER_MANAGER,
    client.UserRole.PROJECT_MANAGER,
  )
  async getProjectManagers() {
    return this.usersService.findByRole(client.UserRole.PROJECT_MANAGER);
  }

  @Get('employees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.HIGHER_MANAGER,
    client.UserRole.PROJECT_MANAGER,
  )
  async getEmployees() {
    return this.usersService.findByRole(client.UserRole.EMPLOYEE);
  }

  @Get('drafters')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  async getDrafters() {
    return this.usersService.findByRole(client.UserRole.DRAFTER);
  }

  @Get('media-managers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
  async getMediaManagers() {
    return this.usersService.findByRole(client.UserRole.MEDIA_MANAGER);
  }
}