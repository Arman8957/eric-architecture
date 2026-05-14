import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { User } from '@prisma/client';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  create(@Body() createTeamDto: CreateTeamDto, @CurrentUser() user: User) {
    return this.teamService.create(createTeamDto, user);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
  findAll(@CurrentUser() user: User) {
    return this.teamService.findAll(user);
  }

  @Get('assignable-members')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  getAssignableMembers() {
    return this.teamService.getAssignableMembers();
  }

  @Get(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.teamService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  update(
    @Param('id') id: string,
    @Body() updateTeamDto: UpdateTeamDto,
    @CurrentUser() user: User,
  ) {
    return this.teamService.update(id, updateTeamDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER)
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.teamService.remove(id, user);
  }
}
