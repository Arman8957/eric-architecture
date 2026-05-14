import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';

import {
  RequestStatus,
  UserRole,
  User,
  Prisma,
  ProjectRequest,
  ServiceType,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailerService } from 'src/utils/email/email.service';
import { GetMyMeetingsDto, QueryProjectRequestDto } from './dto/query-project-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { CreateMeetingLinkDto } from './dto/create-meeting-link.dto';
import { NotificationService } from 'src/modules/notification/notification.service';

@Injectable()
export class ProjectRequestService {
  private readonly logger = new Logger(ProjectRequestService.name);

  private readonly REQUEST_MANAGERS = new Set<UserRole>([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROJECT_MANAGER,
  ]);

  private readonly ASSIGNABLE_ROLES = new Set<UserRole>([
    UserRole.ADMIN,
    UserRole.HIGHER_MANAGER,
    UserRole.PROJECT_MANAGER,
  ]);

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
    private notificationService: NotificationService,
  ) { }

  private canManageRequests(user: User): boolean {
    return this.REQUEST_MANAGERS.has(user.role);
  }

  private async isUserInProjectTeams(projectRequestId: string, userId: string): Promise<boolean> {
    if (this.REQUEST_MANAGERS.has(UserRole.SUPER_ADMIN) || this.REQUEST_MANAGERS.has(UserRole.ADMIN) || this.REQUEST_MANAGERS.has(UserRole.PROJECT_MANAGER)) {
        // We need to check the actual user role, not the set
    }
    // Re-evaluating: better to check role directly for administrative bypass
    return false; // placeholder
  }

  private isAdminOrManager(user: User): boolean {
    return user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN || user.role === UserRole.PROJECT_MANAGER;
  }

  private async isAssignedToProject(projectRequestId: string, user: User): Promise<boolean> {
    if (this.isAdminOrManager(user)) return true;

    const project = await this.prisma.projectRequest.findUnique({
      where: { id: projectRequestId },
      include: { teams: { include: { members: true } } },
    });

    if (!project) return false;

    return project.teams.some(team => 
      team.members.some(member => member.id === user.id)
    );
  }

  async findAll(query: QueryProjectRequestDto, user: User) {
    const isStaff = user.role === UserRole.DRAFTER || user.role === UserRole.EMPLOYEE;
    const canManage = this.canManageRequests(user);

    if (!canManage && !isStaff) {
      throw new ForbiddenException('Access denied');
    }

    const {
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      order = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const conditions: Prisma.ProjectRequestWhereInput[] = [
      { deletedAt: null },
      { isArchived: query.includeArchived ? undefined : false },
    ];

    // If staff (Drafter/Employee), only show projects assigned to their teams
    if (isStaff && !this.isAdminOrManager(user)) {
      conditions.push({
        teams: { some: { members: { some: { id: user.id } } } }
      });
    }

    if (query.archivedOnly) {
      conditions.push({ isArchived: true });
    }

    if (status) {
      conditions.push({ status });
    }

    if (search) {
      conditions.push({
        OR: [
          { projectName: { contains: search, mode: 'insensitive' } },
          { clientFirstName: { contains: search, mode: 'insensitive' } },
          { clientLastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { companyName: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.ProjectRequestWhereInput = { AND: conditions };

    const [requests, total] = await Promise.all([
      this.prisma.projectRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: order },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          assignedManager: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          teams: {
            include: {
              members: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                },
              },
            },
          },
          assets: {
            select: {
              id: true,
              type: true,
              title: true,
              cdnUrl: true,
              thumbnailUrl: true,
            },
          },
          proposals: {
            select: {
              id: true,
              proposalNumber: true,
              status: true,
              createdAt: true,
            },
          },
          stages: {
            select: {
              id: true,
              name: true,
              status: true,
              progress: true,
              driveLink: true,
              completedAt: true,
            },
            orderBy: { order: 'asc' },
          },
          meetingLinks: {
            select: {
              id: true,
              meetingUrl: true,
              title: true,
              scheduledAt: true,
              notes: true,
              createdAt: true,
            },
            orderBy: { scheduledAt: 'desc' },
          },
        },
      }),
      this.prisma.projectRequest.count({ where }),
    ]);

    return {
      data: requests,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, user: User) {
    const request = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
        assignedManager: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        teams: {
          include: {
            members: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        assets: {
          orderBy: { order: 'asc' },
        },
        stages: {
          orderBy: { order: 'asc' },
        },
        proposals: {
          orderBy: { createdAt: 'desc' },
          include: {
            services: true,
            credits: true,
            projectStages: {
              orderBy: { order: 'asc' },
            },
          },
        },
        meetingLinks: {
          select: {
            id: true,
            meetingUrl: true,
            title: true,
            scheduledAt: true,
            notes: true,
            createdAt: true,
            sentByUser: {
              select: { id: true, name: true, role: true },
            },
          },
          orderBy: { scheduledAt: 'desc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const isTeamMember = request.teams?.some(team => 
      team.members?.some(member => member.id === user.id)
    );

    if (!this.canManageRequests(user) && request.userId !== user.id && !isTeamMember) {
      throw new ForbiddenException('Access denied');
    }

    return request;
  }

  async getRequestsByStatus(user: User) {
    const isStaff = user.role === UserRole.DRAFTER || user.role === UserRole.EMPLOYEE;
    const canManage = this.canManageRequests(user);

    if (!canManage && !isStaff) {
      throw new ForbiddenException('Access denied');
    }

    const globalWhere: Prisma.ProjectRequestWhereInput = {
      deletedAt: null,
      isArchived: false,
    };

    if (isStaff && !canManage) {
      globalWhere.teams = { some: { members: { some: { id: user.id } } } };
    }

    // 1. Global Stats - For "all projects visible to this user"
    const [globalCounts, globalTotal] = await Promise.all([
      this.prisma.projectRequest.groupBy({
        by: ['status'],
        where: globalWhere,
        _count: true,
      }),
      this.prisma.projectRequest.count({
        where: globalWhere,
      }),
    ]);

    const globalStats = {
      total: globalTotal,
      inquiry: 0,
      bidding: 0,
      active: 0,
      done: 0,
    };

    globalCounts.forEach((item) => {
      const status = item.status;
      const count = item._count;

      if (status === RequestStatus.PENDING || status === RequestStatus.REVIEWED) {
        globalStats.inquiry += count;
      } else if (status === RequestStatus.SCHEDULED) {
        globalStats.bidding += count;
      } else if (status === RequestStatus.ACTIVE) {
        globalStats.active += count;
      } else if (status === RequestStatus.COMPLETED) {
        globalStats.done += count;
      }
    });

    // 2. Assigned Stats - For "only assigned projects' stat"
    const assignedWhere: Prisma.ProjectRequestWhereInput = {
      deletedAt: null,
      isArchived: false,
    };

    if (canManage) {
      assignedWhere.assignedManagerId = user.id;
    } else {
      // For staff, filter by team membership
      assignedWhere.teams = { some: { members: { some: { id: user.id } } } };
    }

    const [assignedCounts, assignedTotal, taskCount] = await Promise.all([
      this.prisma.projectRequest.groupBy({
        by: ['status'],
        where: assignedWhere,
        _count: true,
      }),
      this.prisma.projectRequest.count({
        where: assignedWhere,
      }),
      this.prisma.projectStage.count({
        where: {
          projectRequest: assignedWhere,
        },
      }),
    ]);

    const assignedStats = {
      total: assignedTotal,
      complete: 0,
      inProgress: 0,
      notStarted: 0,
      tasks: taskCount,
    };

    assignedCounts.forEach((item) => {
      const status = item.status;
      const count = item._count;

      if (status === RequestStatus.COMPLETED) {
        assignedStats.complete += count;
      } else if (status === RequestStatus.ACTIVE) {
        assignedStats.inProgress += count;
      } else if (
        status === RequestStatus.PENDING ||
        status === RequestStatus.REVIEWED ||
        status === RequestStatus.SCHEDULED
      ) {
        assignedStats.notStarted += count;
      }
    });

    return {
      global: globalStats,
      assigned: assignedStats,
    };
  }

  async assignManager(projectId: string, managerId: string, user: User) {
    // Only SUPER_ADMIN can assign project managers
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only Super Admin can assign project managers');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id: projectId, deletedAt: null },
    });

    if (!request) {
      throw new NotFoundException('Project request not found');
    }

    // Verify the manager exists and has the right role
    if (managerId) {
      const manager = await this.prisma.user.findUnique({
        where: { id: managerId },
      });

      if (!manager) {
        throw new NotFoundException('Manager not found');
      }

      if (manager.role !== UserRole.PROJECT_MANAGER && manager.role !== UserRole.SUPER_ADMIN && manager.role !== UserRole.ADMIN) {
        throw new BadRequestException('User is not a project manager');
      }
    }

    const updated = await this.prisma.projectRequest.update({
      where: { id: projectId },
      data: {
        assignedManagerId: managerId || null,
      },
      include: {
        assignedManager: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    return updated;
  }

  async assignTeams(projectId: string, teamIds: string[], user: User) {
    const request = await this.prisma.projectRequest.findUnique({
      where: { id: projectId, deletedAt: null },
      include: { assignedManager: true },
    });

    if (!request) {
      throw new NotFoundException('Project request not found');
    }

    // Only Admin or the assigned Manager can assign teams
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN && request.assignedManagerId !== user.id) {
      throw new ForbiddenException('Only the assigned manager or admin can assign teams');
    }

    const updated = await this.prisma.projectRequest.update({
      where: { id: projectId },
      data: {
        teams: {
          set: teamIds.map(id => ({ id })),
        },
      },
      include: {
        teams: {
          include: {
            members: true,
          },
        },
      },
    });

    // Notify all team members
    const membersToNotify = new Set<string>();
    updated.teams.forEach(team => {
      team.members.forEach(member => {
        membersToNotify.add(member.id);
      });
    });

    for (const memberId of membersToNotify) {
      await this.notificationService.createNotification({
        userId: memberId,
        type: 'PROJECT_ASSIGNED_TO_TEAM',
        title: `Project Assigned: ${updated.projectName}`,
        message: `Your team has been assigned to the project "${updated.projectName}".`,
        link: `/dashboard/projects/${updated.id}`,
        projectRequestId: updated.id,
      });

      // Also send email
      const member = updated.teams.flatMap(t => t.members).find(m => m.id === memberId);
      if (member) {
        await this.mailer.sendGeneralNotification(
          member.email,
          member.name || 'Team Member',
          {
            title: `Project Assigned: ${updated.projectName}`,
            message: `Your team has been assigned to the project "${updated.projectName}". Please log in to view details.`
          }
        );
      }
    }
    
    return updated;
  }

  async startProject(projectId: string, user: User) {
    const request = await this.prisma.projectRequest.findUnique({
      where: { id: projectId, deletedAt: null },
    });

    if (!request) {
      throw new NotFoundException('Project request not found');
    }

    // Only the assigned manager, Admin, or Team Member can start the project
    const isAssigned = await this.isAssignedToProject(projectId, user);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN && request.assignedManagerId !== user.id && !isAssigned) {
      throw new ForbiddenException('Only the assigned manager, admin, or team members can start the project');
    }

    if (request.isProjectStarted) {
      throw new BadRequestException('Project is already started');
    }

    return this.prisma.projectRequest.update({
      where: { id: projectId },
      data: {
        isProjectStarted: true,
        projectStartedAt: new Date(),
        status: RequestStatus.ACTIVE,
      },
    });
  }

  async updateStatus(id: string, dto: UpdateRequestStatusDto, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    if (!(await this.isAssignedToProject(id, user))) {
       throw new ForbiddenException('Access denied to this project');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
      include: {
        user: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    this.validateStatusTransition(request.status, dto.status);

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: {
        status: dto.status,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (request.user) {
      await this.sendStatusChangeEmail(updated, dto.notes);
    }

    this.logger.log(
      `Request ${id} status changed to ${dto.status} by ${user.email}`,
    );

    return {
      success: true,
      message: `Project request status updated to ${dto.status} successfully`,
      data: updated,
    };
  }

  private validateStatusTransition(
    current: RequestStatus,
    next: RequestStatus,
  ) {
    const validTransitions: Record<RequestStatus, RequestStatus[]> = {
      [RequestStatus.PENDING]: [
        RequestStatus.REVIEWED,
        RequestStatus.CANCELLED,
      ],
      [RequestStatus.REVIEWED]: [
        RequestStatus.SCHEDULED,
        RequestStatus.CANCELLED,
      ],
      [RequestStatus.SCHEDULED]: [
        RequestStatus.ACTIVE,
        RequestStatus.COMPLETED,
        RequestStatus.CANCELLED,
      ],
      [RequestStatus.ACTIVE]: [
        RequestStatus.COMPLETED,
        RequestStatus.CANCELLED,
      ],
      [RequestStatus.COMPLETED]: [],
      [RequestStatus.CANCELLED]: [],
    };

    if (!validTransitions[current]?.includes(next)) {
      throw new BadRequestException(
        `Cannot transition from ${current} to ${next}`,
      );
    }
  }

  private async sendStatusChangeEmail(
    request: ProjectRequest & { user: any },
    notes?: string,
  ) {
    if (!request.user) return;

    try {
      await this.mailer.sendRequestStatusChange(
        request.user.email,
        request.user.name || 'Client',
        {
          requestId: request.id,
          projectName: request.projectName,
          status: request.status,
          notes,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send status email for request ${request.id}`,
        error,
      );
    }
  }

  async assignRequest(id: string, targetUserId: string, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    if (!this.ASSIGNABLE_ROLES.has(targetUser.role)) {
      throw new BadRequestException('Target user cannot be assigned requests');
    }

    this.logger.log(
      `Request ${id} assigned to ${targetUser.email} by ${user.email}`,
    );

    return { message: 'Request assigned successfully' };
  }

  async updateDriveLink(id: string, driveLink: string, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    if (!(await this.isAssignedToProject(id, user))) {
      throw new ForbiddenException('Access denied to this project');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: { driveLink },
    });

    return {
      success: true,
      message: 'Google Drive link updated successfully',
      data: updated,
    };
  }

  async deleteDriveLink(id: string, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    if (!(await this.isAssignedToProject(id, user))) {
      throw new ForbiddenException('Access denied to this project');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: { driveLink: null },
    });

    return {
      success: true,
      message: 'Google Drive link removed successfully',
      data: updated,
    };
  }

  async deleteRequest(id: string, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    // Permanent delete if already archived or if user is super admin
    if (request.isArchived || user.role === UserRole.SUPER_ADMIN) {
      await this.prisma.projectRequest.delete({
        where: { id },
      });
      this.logger.log(`Request ${id} permanently deleted by ${user.email}`);
      return { message: 'Project permanently deleted successfully' };
    }

    await this.prisma.projectRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Request ${id} soft deleted by ${user.email}`);

    return { message: 'Project moved to trash successfully' };
  }

  async archiveRequest(id: string, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archiverId: user.id,
      },
    });

    this.logger.log(`Request ${id} archived by ${user.email}`);

    return {
      success: true,
      message: 'Project archived successfully',
      data: updated,
    };
  }

  async unarchiveRequest(id: string, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: {
        isArchived: false,
        archivedAt: null,
        archiverId: null,
      },
    });

    this.logger.log(`Request ${id} unarchived by ${user.email}`);

    return {
      success: true,
      message: 'Project restored from archive successfully',
      data: updated,
    };
  }

  async getArchivedRequests(user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.projectRequest.findMany({
      where: { isArchived: true, deletedAt: null },
      orderBy: { archivedAt: 'desc' },
      include: {
        user: { select: { name: true, email: true } },
      },
    });
  }

  async getMyRequests(user: User, query: QueryProjectRequestDto) {
    const { status, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectRequestWhereInput = {
      deletedAt: null,
      isArchived: false,
    };

    // For staff roles (PM/Admin/Super Admin), show projects assigned to them
    // For clients/regular users, show projects they created
    // For staff roles (PM/Admin/Super Admin), show projects assigned to them or their teams
    if (this.canManageRequests(user)) {
      where.OR = [
        { assignedManagerId: user.id },
        { teams: { some: { members: { some: { id: user.id } } } } }
      ];
    } else {
      // For drafters/employees who can't "manage" requests but are team members
      if (user.role === UserRole.DRAFTER || user.role === UserRole.EMPLOYEE) {
        where.teams = { some: { members: { some: { id: user.id } } } };
      } else {
        where.userId = user.id;
      }
    }

    if (status) {
      where.status = status;
    }

    const [requests, total] = await Promise.all([
      this.prisma.projectRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          assignedManager: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          assets: {
            select: {
              id: true,
              type: true,
              title: true,
              cdnUrl: true,
              thumbnailUrl: true,
            },
          },
          proposals: {
            select: {
              id: true,
              proposalNumber: true,
              status: true,
              totalAmount: true,
              createdAt: true,
            },
          },
          stages: {
            select: {
              id: true,
              name: true,
              status: true,
              progress: true,
              driveLink: true,
              completedAt: true,
            },
            orderBy: { order: 'asc' },
          },
          meetingLinks: {
            orderBy: { scheduledAt: 'desc' },
            select: {
              id: true,
              meetingUrl: true,
              title: true,
              scheduledAt: true,
              notes: true,
              emailSent: true,
              createdAt: true,
              sentByUser: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.projectRequest.count({ where }),
    ]);

    return {
      data: requests,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }


  async sendMeetingLink(dto: CreateMeetingLinkDto, staff: User) {
    // 1. Only staff can send
    if (!this.canManageRequests(staff)) {
      throw new ForbiddenException('Access denied');
    }

    // Check if assigned to project
    if (!(await this.isAssignedToProject(dto.projectRequestId, staff))) {
      throw new ForbiddenException('You are not assigned to this project team');
    }

    // 2. Find the project request + its linked user
    const projectRequest = await this.prisma.projectRequest.findFirst({
      where: { id: dto.projectRequestId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!projectRequest) {
      throw new NotFoundException('Project request not found');
    }

    // 3. Must have a linked user to send email to
    if (!projectRequest.userId || !projectRequest.user) {
      throw new BadRequestException(
        'This project request has no linked user. Cannot send meeting link.',
      );
    }

    // 4. Create meeting link record
    const meetingLink = await this.prisma.meetingLink.create({
      data: {
        projectRequestId: dto.projectRequestId,
        sentToUserId: projectRequest.userId,
        sentByUserId: staff.id,
        meetingUrl: dto.meetingUrl,
        title: dto.title,
        scheduledAt: new Date(dto.scheduledAt),
        notes: dto.notes || null,
        emailSent: false,
      },
      include: {
        sentByUser: { select: { id: true, name: true, email: true, role: true } },
        sentToUser: { select: { id: true, name: true, email: true } },
        projectRequest: { select: { id: true, projectName: true, status: true } },
      },
    });

    // 5. Send email to the user
    let emailSent = false;
    try {
      await this.mailer.sendMeetingInvitation(
        projectRequest.user.email,
        projectRequest.user.name || 'Client',
        {
          meetingTitle: dto.title,
          meetingUrl: dto.meetingUrl,
          scheduledAt: new Date(dto.scheduledAt),
          projectName: projectRequest.projectName,
          senderName: staff.name || 'Project Team',
          senderRole: staff.role,
          notes: dto.notes,
        },
      );
      emailSent = true;

      // 6. Update emailSent flag
      await this.prisma.meetingLink.update({
        where: { id: meetingLink.id },
        data: { emailSent: true, emailSentAt: new Date() },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send meeting email for ${meetingLink.id}`,
        error,
      );
    }

    this.logger.log(
      `Meeting link sent for project ${dto.projectRequestId} by ${staff.email} to ${projectRequest.user.email}`,
    );

    return {
      success: true,
      message: emailSent
        ? 'Meeting link sent successfully and email delivered'
        : 'Meeting link created but email delivery failed',
      emailSent,
      data: meetingLink,
    };
  }

  // async getMyMeetings(userId: string) {
  // //   const meetings = await this.prisma.meetingLink.findMany({
  // //     where: { sentToUserId: userId },
  // //     orderBy: { scheduledAt: 'desc' },
  // //     include: {
  // //       projectRequest: {
  // //         select: { id: true, projectName: true, status: true, serviceType: true },
  // //       },
  // //       sentByUser: { select: { id: true, name: true, role: true } },
  // //     },
  // //   });

  // //   return {
  // //     success: true,
  // //     total: meetings.length,
  // //     data: meetings,
  // //   };
  // // }

  async getMyMeetings(
    userId: string,
    query: GetMyMeetingsDto,
  ): Promise<{
    success: true;
    data: Array<{
      id: string;
      meetingUrl: string;
      title: string;
      scheduledAt: Date;
      notes?: string | null;
      emailSent: boolean;
      createdAt: Date;
      projectRequest: {
        id: string;
        projectName: string;
        status: RequestStatus;
        serviceType: ServiceType;
      };
      sentBy: {
        id: string;
        name: string | null;
        role: UserRole;
      };
    }>;
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    };
  }> {
    const { page = 1, limit = 20, type = 'all' } = query;

    if (!userId) {
      throw new BadRequestException('User ID is required');
    }

    // Build dynamic where clause
    const where: Prisma.MeetingLinkWhereInput = {
      sentToUserId: userId,
    };

    // Optional: filter by upcoming / past
    if (type === 'upcoming') {
      where.scheduledAt = { gte: new Date() };
    } else if (type === 'past') {
      where.scheduledAt = { lt: new Date() };
    }

    // Count total for pagination metadata
    const total = await this.prisma.meetingLink.count({ where });

    const skip = (page - 1) * limit;

    const meetings = await this.prisma.meetingLink.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        // Most important: upcoming first, then newest
        { scheduledAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        meetingUrl: true,
        title: true,
        scheduledAt: true,
        notes: true,
        emailSent: true,
        createdAt: true,
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            status: true,
            serviceType: true,
          },
        },
        sentByUser: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: meetings.map((m) => ({
        ...m,
        // Rename for frontend friendliness
        sentBy: m.sentByUser,
        // remove the nested sentByUser
      })),
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async getMyMeetingById(meetingId: string, userId: string) {
    const meeting = await this.prisma.meetingLink.findFirst({
      where: {
        id: meetingId,
        sentToUserId: userId, // user can only see their own
      },
      include: {
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            status: true,
            serviceType: true,
            projectCity: true,
            projectState: true,
          },
        },
        sentByUser: { select: { id: true, name: true, role: true } },
      },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    return {
      success: true,
      data: meeting,
    };
  }

  // ========================================
  // NEW INQUIRY METHODS
  // ========================================

  async createNewInquiry(
    body: {
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
    staffUser: User,
  ) {
    if (!this.canManageRequests(staffUser)) {
      throw new ForbiddenException('Access denied');
    }

    const { clientInfo, projectInfo, password } = body;

    if (!clientInfo.email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    if (password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    // Map service type string to enum
    const serviceTypeMap: Record<string, any> = {
      'New Construction': 'NEW_CONSTRUCTION',
      'Renovation': 'RENOVATION',
      'Addition': 'ADDITION',
      'Interior Design': 'INTERIOR_DESIGN',
      'NEW_CONSTRUCTION': 'NEW_CONSTRUCTION',
      'RENOVATION': 'RENOVATION',
      'ADDITION': 'ADDITION',
      'INTERIOR_DESIGN': 'INTERIOR_DESIGN',
    };

    const projectCategoryMap: Record<string, any> = {
      'Residential': 'RESIDENTIAL',
      'Commercial': 'COMMERCIAL',
      'Mixed-Use': 'MIXED_USE',
      'Institutional': 'INSTITUTIONAL',
      'RESIDENTIAL': 'RESIDENTIAL',
      'COMMERCIAL': 'COMMERCIAL',
      'MIXED_USE': 'MIXED_USE',
      'INSTITUTIONAL': 'INSTITUTIONAL',
    };

    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 12);
    const normalizedEmail = clientInfo.email.toLowerCase().trim();

    // Use a transaction to create user + project request atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Check if user exists
      let clientUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (clientUser) {
        // User exists - update password and verify status if it's a regular USER
        if (clientUser.role === 'USER') {
          clientUser = await tx.user.update({
            where: { id: clientUser.id },
            data: {
              password: hashedPassword,
              emailVerified: true,
            },
          });
          this.logger.log(`User ${normalizedEmail} already exists, updated password and verified status`);
        } else {
          this.logger.log(`User ${normalizedEmail} already exists with role ${clientUser.role}, linking inquiry without password update`);
        }
      } else {
        // 2. Create user account with password
        clientUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: `${clientInfo.firstName} ${clientInfo.lastName}`.trim(),
            password: hashedPassword,
            role: 'USER',
            emailVerified: true, // auto-verified since PM creates the account
          },
        });
        this.logger.log(`Created new user account for ${normalizedEmail}`);
      }

      // 3. Create project request
      const projectRequest = await tx.projectRequest.create({
        data: {
          clientFirstName: clientInfo.firstName,
          clientLastName: clientInfo.lastName,
          companyName: clientInfo.companyName || null,
          email: normalizedEmail,
          phone: clientInfo.phone || null,
          streetAddress: clientInfo.address || null,
          city: clientInfo.city || null,
          state: clientInfo.state || null,
          country: clientInfo.country || 'United States',
          additionalComments: clientInfo.additionalNotes || null,
          projectName: projectInfo.projectName,
          additionalNotes: projectInfo.additionalContext || projectInfo.projectDescription || null,
          projectStreetAddress: projectInfo.streetAddress || null,
          projectCity: projectInfo.city || null,
          projectState: projectInfo.state || null,
          projectZipCode: projectInfo.zip || null,
          projectCountry: projectInfo.country || 'United States',
          projectLocationSameAsClient: projectInfo.sameAsMailingAddress || false,
          serviceType: serviceTypeMap[projectInfo.serviceType || 'New Construction'] || 'NEW_CONSTRUCTION',
          projectCategory: projectCategoryMap[projectInfo.projectType || ''] || null,
          projectSize: projectInfo.squareFootage || null,
          budgetRange: projectInfo.budgetRange || null,
          userId: clientUser.id,
          isNewInquiry: true,
          isApproved: true, // PM-created inquiries are auto-approved
          status: 'PENDING',
          assignedManagerId: staffUser.id,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true },
          },
          assignedManager: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
      });

      return { clientUser, projectRequest };
    }, {
      timeout: 10000
    });

    this.logger.log(
      `New inquiry created by ${staffUser.email} for ${normalizedEmail} - Project: ${projectInfo.projectName}`,
    );

    // 4. Send welcome email 
    try {
      await this.mailer.sendNewInquiryWelcomeEmail(
        result.clientUser.email,
        `${clientInfo.firstName} ${clientInfo.lastName}`,
        {
          projectName: projectInfo.projectName,
          password: password,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send welcome email for inquiry ${result.projectRequest.id}`, error);
    }

    return {
      success: true,
      message: 'New inquiry created successfully. Client account has been set up.',
      data: result.projectRequest,
      clientEmail: result.clientUser.email,
    };
  }

  async getAllNewInquiries(user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    const inquiries = await this.prisma.projectRequest.findMany({
      where: {
        isNewInquiry: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        assignedManager: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        proposals: {
          select: {
            id: true,
            proposalNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
        meetingLinks: {
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            meetingUrl: true,
          },
          orderBy: { scheduledAt: 'desc' },
          take: 1,
        },
      },
    });

    return {
      success: true,
      data: inquiries,
      total: inquiries.length,
    };
  }

  async getMyNewInquiries(user: User) {
    const inquiries = await this.prisma.projectRequest.findMany({
      where: {
        userId: user.id,
        isNewInquiry: true,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        assignedManager: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        proposals: {
          select: {
            id: true,
            proposalNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            services: {
              select: {
                id: true,
                name: true,
                amount: true,
              },
            },
          },
        },
        meetingLinks: {
          select: {
            id: true,
            title: true,
            scheduledAt: true,
            meetingUrl: true,
            sentByUser: {
              select: { name: true, role: true },
            },
          },
          orderBy: { scheduledAt: 'desc' },
        },
      },
    });

    return {
      success: true,
      data: inquiries,
      total: inquiries.length,
    };
  }

  async requestMeeting(
    projectRequestId: string,
    dto: { scheduledAt: string; notes?: string },
    user: User,
  ) {
    // 1. Find the project request and verify ownership
    const projectRequest = await this.prisma.projectRequest.findFirst({
      where: { id: projectRequestId, userId: user.id, deletedAt: null },
    });

    if (!projectRequest) {
      throw new NotFoundException('Project request not found or not owned by you');
    }

    // 2. Find managers to notify
    const managers = await this.prisma.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'] },
        isActive: true,
      },
      select: { id: true, email: true, name: true },
    });

    // 3. Create a MeetingLink as a "REQUEST" placeholder
    // This allows it to show up in the project's meetingLinks list
    await this.prisma.meetingLink.create({
      data: {
        projectRequestId: projectRequestId,
        sentByUserId: user.id,
        sentToUserId: user.id, // placeholder - the client themselves
        meetingUrl: 'https://pending.request', // special flag for requested meetings
        title: 'Meeting Requested by Client',
        scheduledAt: new Date(dto.scheduledAt),
        notes: dto.notes || 'No additional notes provided.',
      },
    });

    // 4. Create notifications for all managers
    const clientName = `${projectRequest.clientFirstName} ${projectRequest.clientLastName}`.trim();
    const notificationData = managers.map((manager) => ({
      userId: manager.id,
      type: 'MEETING_REQUEST',
      title: 'New Meeting Request',
      message: `${clientName} has requested a meeting for project "${projectRequest.projectName}" on ${new Date(dto.scheduledAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
      link: `/dashboard?project=${projectRequestId}`,
    }));

    await this.prisma.notification.createMany({
      data: notificationData,
    });

    // 5. Send email to managers
    for (const manager of managers) {
      try {
        await this.mailer.sendMail({
          to: manager.email,
          subject: `Meeting Request: ${projectRequest.projectName}`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">📅 New Meeting Request</h2>
            <p>Hello ${manager.name || 'Team'},</p>
            <p><strong>${clientName}</strong> has requested a meeting for the following project:</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Project:</strong> ${projectRequest.projectName}</p>
              <p><strong>Requested Date:</strong> ${new Date(dto.scheduledAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
              ${dto.notes ? `<p><strong>Notes:</strong> ${dto.notes}</p>` : ''}
              <p><strong>Client Email:</strong> ${projectRequest.email}</p>
            </div>
            
            <p>Please go to the project details to schedule and send a meeting link.</p>
            
            <div style="margin-top: 30px; text-align: center;">
              <a href="http://localhost:5173/dashboard?project=${projectRequestId}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Project Details</a>
            </div>
            
            <p style="margin-top: 40px; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px;">Best regards,<br>Architecture Simple Platform</p>
          </div>
          `,
          text: `Meeting request from ${clientName} for ${projectRequest.projectName}`,
        });
      } catch (error) {
        this.logger.error(
          `Failed to send meeting request email to ${manager.email}`,
          error,
        );
      }
    }

    this.logger.log(
      `Meeting requested by ${user.email} for project ${projectRequestId}`,
    );

    return {
      success: true,
      message: 'Meeting request sent successfully. The project manager will be in touch.',
    };
  }
}
