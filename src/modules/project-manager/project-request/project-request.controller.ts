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
} from '@nestjs/common';
import { ProjectRequestService } from './project-request.service';

import * as client from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import {
  GetMyMeetingsDto,
  QueryProjectRequestDto,
} from './dto/query-project-request.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { AssignRequestDto } from './dto/create-project-request.dto';
import { CreateMeetingLinkDto } from './dto/create-meeting-link.dto';

@Controller('project-requests-admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProjectRequestController {
  // meetingLink: any;
  constructor(private readonly projectRequestService: ProjectRequestService) { }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
  findAll(
    @Query() query: QueryProjectRequestDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.findAll(query, user);
  }

  @Get('stats')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
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

  // @Get(':id')
  // findOne(@Param('id') id: string, @CurrentUser() user: client.User) {
  //   return this.projectRequestService.findOne(id, user);
  // }

  @Patch(':id/status')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateRequestStatusDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.updateStatus(id, dto, user);
  }

  @Post(':id/assign')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  assignRequest(
    @Param('id') id: string,
    @Body() dto: AssignRequestDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.assignRequest(id, dto.userId, user);
  }

  @Patch(':id/assign-manager')
  @Roles(client.UserRole.SUPER_ADMIN)
  assignManager(
    @Param('id') id: string,
    @Body() body: { managerId: string },
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.assignManager(id, body.managerId, user);
  }

  @Patch(':id/assign-teams')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  assignTeams(
    @Param('id') id: string,
    @Body() body: { teamIds: string[] },
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.assignTeams(id, body.teamIds, user);
  }

  @Post(':id/start')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  startProject(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.startProject(id, user);
  }

  @Patch(':id/drive-link')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
  updateDriveLink(
    @Param('id') id: string,
    @Body() body: { driveLink: string },
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.updateDriveLink(id, body.driveLink, user);
  }

  @Delete(':id/drive-link')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
  deleteDriveLink(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.deleteDriveLink(id, user);
  }

  @Delete(':id')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectRequestService.deleteRequest(id, user);
  }

  @Patch(':id/archive')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  archive(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectRequestService.archiveRequest(id, user);
  }

  @Patch(':id/unarchive')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  unarchive(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectRequestService.unarchiveRequest(id, user);
  }

  @Get('archived')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  getArchived(@CurrentUser() user: client.User) {
    return this.projectRequestService.getArchivedRequests(user);
  }

  //====================meeting ======

  @Post('send')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
  @HttpCode(HttpStatus.CREATED)
  async sendMeetingLink(
    @Body() dto: CreateMeetingLinkDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.sendMeetingLink(dto, user);
  }

  // ========================================
  // USER ROUTES
  // ========================================

  @Get('my-meetings')
  async getMyMeetings(
    @CurrentUser() user: client.User,
    @Query() query: GetMyMeetingsDto,
  ) {
    return this.projectRequestService.getMyMeetings(user.id, query);
  }

  @Get('my-meetings/:id')
  async getMyMeetingById(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.getMyMeetingById(id, user.id);
  }

  @Post('request-meeting')
  @HttpCode(HttpStatus.CREATED)
  async requestMeeting(
    @Body() body: { projectRequestId: string; scheduledAt: string; notes?: string },
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.requestMeeting(
      body.projectRequestId,
      { scheduledAt: body.scheduledAt, notes: body.notes },
      user,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectRequestService.findOne(id, user);
  }

  // ========================================
  // NEW INQUIRY ENDPOINTS
  // ========================================

  @Post('new-inquiry')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  @HttpCode(HttpStatus.CREATED)
  async createNewInquiry(
    @Body() body: {
      clientInfo: {
        firstName: string;
        lastName: string;
        companyName?: string;
        email: string;
        phone?: string;
        address?: string;
        city?: string;
        state?: string;
        country?: string;
        additionalNotes?: string;
      };
      projectInfo: {
        projectName: string;
        projectDescription?: string;
        additionalContext?: string;
        streetAddress?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
        sameAsMailingAddress?: boolean;
        serviceType?: string;
        projectType?: string;
        squareFootage?: string;
        budgetRange?: string;
        timeline?: string;
      };
      password: string;
    },
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.createNewInquiry(body, user);
  }

  @Get('new-inquiries/all')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  async getAllNewInquiries(@CurrentUser() user: client.User) {
    return this.projectRequestService.getAllNewInquiries(user);
  }

  @Get('new-inquiries/my')
  async getMyNewInquiries(@CurrentUser() user: client.User) {
    return this.projectRequestService.getMyNewInquiries(user);
  }
}
