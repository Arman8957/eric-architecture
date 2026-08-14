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
import {
  AttachMeetingLinkDto,
  CreateMeetingLinkDto,
} from './dto/create-meeting-link.dto';
import { CreateScheduleBlockDto } from './dto/schedule-block.dto';

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
  @Roles(client.UserRole.SUPER_ADMIN)
  remove(
    @Param('id') id: string,
    @Body('password') password: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.deleteRequest(id, password, user);
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

  /**
   * Attach the joining link to a meeting that already exists — how a PM
   * follows up after accepting a client's requested time, without creating a
   * duplicate booking on the same slot.
   */
  @Patch('meetings/:id/link')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
  @HttpCode(HttpStatus.OK)
  async attachMeetingLink(
    @Param('id') id: string,
    @Body() dto: AttachMeetingLinkDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.attachMeetingLink(id, dto, user);
  }

  @Delete('meetings/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
  @HttpCode(HttpStatus.OK)
  async deleteMeeting(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.deleteMeeting(id, user);
  }

  @Patch('meetings/:id/respond')
  async respondToMeeting(
    @Param('id') id: string,
    @Body('action') action: 'accept' | 'reject',
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.respondToMeeting(id, action, user);
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
    @Body()
    body: {
      projectRequestId: string;
      scheduledAt: string;
      endsAt?: string;
      notes?: string;
      stageId?: string;
      meetingType?: client.MeetingType;
    },
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.requestMeeting(
      body.projectRequestId,
      {
        scheduledAt: body.scheduledAt,
        endsAt: body.endsAt,
        notes: body.notes,
        stageId: body.stageId,
        meetingType: body.meetingType,
      },
      user,
    );
  }

  /**
   * Free/busy for a manager's calendar, used by both booking calendars.
   * Clients pass their own `projectRequestId`; staff may pass `managerId`.
   */
  @Get('availability')
  async getAvailability(
    @CurrentUser() user: client.User,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('projectRequestId') projectRequestId?: string,
    @Query('managerId') managerId?: string,
    @Query('excludeMeetingId') excludeMeetingId?: string,
  ) {
    return this.projectRequestService.getAvailability(user, {
      from,
      to,
      projectRequestId,
      managerId,
      excludeMeetingId,
    });
  }

  // ── PM time off (site visit / out of office / vacation) ────────────────

  @Get('schedule-blocks')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  async getScheduleBlocks(
    @CurrentUser() user: client.User,
    @Query('managerId') managerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.projectRequestService.listScheduleBlocks(user, {
      managerId,
      from,
      to,
    });
  }

  @Post('schedule-blocks')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  @HttpCode(HttpStatus.CREATED)
  async createScheduleBlock(
    @Body() dto: CreateScheduleBlockDto,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.createScheduleBlock(dto, user);
  }

  @Delete('schedule-blocks/:id')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  @HttpCode(HttpStatus.OK)
  async deleteScheduleBlock(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.deleteScheduleBlock(id, user);
  }

  @Get('schedule')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
    client.UserRole.HIGHER_MANAGER,
    client.UserRole.FINANCE,
  )
  async getMasterSchedule(
    @CurrentUser() user: client.User,
    @Query('managerId') managerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.projectRequestService.getMasterSchedule(user, {
      managerId,
      from,
      to,
    });
  }

  @Patch('stages/:stageId/bypass-meeting')
  @HttpCode(HttpStatus.OK)
  async bypassPhaseMeeting(
    @Param('stageId') stageId: string,
    @Body('bypassed') bypassed: boolean,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.setPhaseMeetingBypass(
      stageId,
      bypassed !== false,
      user,
    );
  }

  @Patch('stages/:stageId/meeting-required')
  @HttpCode(HttpStatus.OK)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  async setPhaseMeetingRequired(
    @Param('stageId') stageId: string,
    @Body('meetingRequired') meetingRequired: boolean,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.setPhaseMeetingRequired(
      stageId,
      meetingRequired !== false,
      user,
    );
  }

  @Post(':id/pay-consultation')
  @HttpCode(HttpStatus.OK)
  async payConsultation(
    @Param('id') id: string,
    @Body('paymentIntentId') paymentIntentId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.attachConsultationPayment(id, paymentIntentId, user);
  }

  // ========================================
  // NEW INQUIRY ENDPOINTS
  // ========================================

  @Get('check-email')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  async checkEmailExists(
    @Query('email') email: string,
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.checkEmailExists(email, user);
  }

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
      password?: string;
    },
    @CurrentUser() user: client.User,
  ) {
    return this.projectRequestService.createNewInquiry(body, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.projectRequestService.findOne(id, user);
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
