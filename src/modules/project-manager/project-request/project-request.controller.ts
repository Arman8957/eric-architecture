
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
} from '@nestjs/common';
import { ProjectRequestService } from './project-request.service';

import * as client from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { QueryProjectRequestDto } from './dto/query-project-request.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { AssignRequestDto } from './dto/create-project-request.dto';


@Controller('project-requests-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectRequestController {
  constructor(
    private readonly projectRequestService: ProjectRequestService,
  ) {}

  
  @Get()
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  findAll(
    @Query() query: QueryProjectRequestDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.findAll(query, user);
  }

  @Get('stats')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  getStats(@CurrentUser() user: client.User) {
    return this.projectRequestService.getRequestsByStatus(user);
  }

  @Get('my-requests')
  getMyRequests(
    @Query() query: QueryProjectRequestDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.getMyRequests(user, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectRequestService.findOne(id, user);
  }

  @Patch(':id/status')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRequestStatusDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.updateStatus(id, dto, user);
  }


  @Post(':id/assign')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  assignRequest(
    @Param('id') id: string,
    @Body() dto: AssignRequestDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.assignRequest(
      id,
      dto.userId,
      user,
    );
  }


  @Delete(':id')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectRequestService.deleteRequest(id, user);
  }
}