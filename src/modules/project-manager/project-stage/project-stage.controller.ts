
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
import { ProjectStageService } from './project-stage.service';
import * as client from '@prisma/client';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CreateStageDto } from './dto/create-stage.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { CompleteStageDto } from './dto/complete-stage.dto';


@Controller('project-stages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectStageController {
  constructor(
    private readonly projectStageService: ProjectStageService,
  ) {}


  @Post()
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  create(
    @Body() createStageDto: CreateStageDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectStageService.create(createStageDto, user);
  }

  @Get('my-tasks')
  getMyTasks(@CurrentUser() user: client.User) {
    return this.projectStageService.getMyAssignedStages(user);
  }

  @Get('proposal/:proposalId')
  getStagesByProposal(
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectStageService.getStagesByProposal(
      proposalId,
      user,
    );
  }


  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectStageService.findOne(id, user);
  }


  @Patch(':id')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  update(
    @Param('id') id: string,
    @Body() updateStageDto: UpdateStageDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectStageService.update(id, updateStageDto, user);
  }


  @Patch(':id/progress')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectStageService.updateProgress(id, dto, user);
  }

  @Post(':id/complete')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteStageDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectStageService.completeStage(id, dto, user);
  }


  @Delete(':id')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.PROJECT_MANAGER)
  remove(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectStageService.deleteStage(id, user);
  }
}