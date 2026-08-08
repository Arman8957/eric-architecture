import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import {
  RequestStatus,
  UserRole,
  User,
  Prisma,
  ProjectRequest,
  ServiceType,
  MeetingStatus,
  ProposalStatus,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailerService } from 'src/utils/email/email.service';
import { GetMyMeetingsDto, QueryProjectRequestDto } from './dto/query-project-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { CreateMeetingLinkDto } from './dto/create-meeting-link.dto';
import { NotificationService } from 'src/modules/notification/notification.service';
import { staffProjectLink } from 'src/common/notification-links';
import { PaymentService } from 'src/modules/payment/payment.service';

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
    private paymentService: PaymentService,
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

  /**
   * The stage ids whose deliverables a client has actually paid for.
   *
   * LUMP_SUM proposals unlock every phase at once, on the single payment.
   * INSTALLMENT proposals unlock one phase at a time, each on its own payment.
   * A project with no accepted proposal yet unlocks nothing.
   *
   * Only COMPLETED payments count — a checkout session that was started but
   * never paid must not open the folder.
   */
  private async unlockedStageIds(
    projectRequestIds: string[],
  ): Promise<Set<string>> {
    const unlocked = new Set<string>();
    if (projectRequestIds.length === 0) return unlocked;

    const [proposals, payments, stages] = await Promise.all([
      this.prisma.proposal.findMany({
        where: {
          projectRequestId: { in: projectRequestIds },
          status: 'ACCEPTED',
          proposalType: 'NORMAL',
        },
        select: {
          projectRequestId: true,
          paymentMethod: true,
          paymentType: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: {
          projectRequestId: { in: projectRequestIds },
          paymentStatus: 'COMPLETED',
        },
        select: {
          projectRequestId: true,
          stageId: true,
          paymentType: true,
        },
      }),
      this.prisma.projectStage.findMany({
        where: { projectRequestId: { in: projectRequestIds } },
        select: { id: true, projectRequestId: true },
      }),
    ]);

    // projectRequestId -> billed as one lump sum. Newest accepted proposal wins.
    const isLumpSumByProject = new Map<string, boolean>();
    for (const proposal of proposals) {
      if (!proposal.projectRequestId) continue;
      if (isLumpSumByProject.has(proposal.projectRequestId)) continue;
      isLumpSumByProject.set(
        proposal.projectRequestId,
        proposal.paymentMethod === 'lumpSum' ||
          proposal.paymentMethod === 'LUMP_SUM' ||
          proposal.paymentType === 'LUMP_SUM',
      );
    }

    const lumpSumPaidProjects = new Set(
      payments
        .filter((p) => p.paymentType === 'LUMP_SUM' && p.projectRequestId)
        .map((p) => p.projectRequestId as string),
    );
    const paidStageIds = new Set(
      payments
        .filter((p) => p.paymentType === 'INSTALLMENT' && p.stageId)
        .map((p) => p.stageId as string),
    );

    for (const stage of stages) {
      if (!stage.projectRequestId) continue;

      const isLumpSum = isLumpSumByProject.get(stage.projectRequestId);
      if (isLumpSum === undefined) continue;

      const paid = isLumpSum
        ? lumpSumPaidProjects.has(stage.projectRequestId)
        : paidStageIds.has(stage.id);

      if (paid) unlocked.add(stage.id);
    }

    return unlocked;
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
        link: staffProjectLink(updated.id, 'management'),
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

  async deleteRequest(id: string, password: string, user: User) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Access denied');
    }

    if (!password) {
      throw new UnauthorizedException('Password is required to delete a project');
    }

    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!fullUser?.password || !(await bcrypt.compare(password, fullUser.password))) {
      throw new UnauthorizedException('Incorrect password');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    // Money that actually changed hands is not ours to erase. Archiving keeps
    // the project out of the way without destroying the payment history.
    const settledPayments = await this.prisma.payment.count({
      where: { projectRequestId: id, paymentStatus: 'COMPLETED' },
    });

    if (settledPayments > 0) {
      throw new BadRequestException(
        `This project has ${settledPayments} completed payment(s) and cannot be deleted. Archive it instead to keep the financial record intact.`,
      );
    }

    // Most rows pointing at a project request use Prisma's default referential
    // action (Restrict), so the delete fails with P2003 unless the dependents go
    // first — proposals_projectRequestId_fkey is the one that trips in practice.
    // Order matters: payments hold a required FK to the proposal, so they have
    // to clear before it.
    await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.deleteMany({ where: { projectRequestId: id } });
      await tx.payment.deleteMany({ where: { projectRequestId: id } });
      await tx.meetingLink.deleteMany({ where: { projectRequestId: id } });
      // Stages hang off the request by an optional FK, so they would be
      // orphaned rather than removed. Their deadline reminders cascade.
      await tx.projectStage.deleteMany({ where: { projectRequestId: id } });
      // Services, credits and amendment requests cascade from the proposal.
      await tx.proposal.deleteMany({ where: { projectRequestId: id } });
      // Not a real FK — just an id column that would otherwise dangle.
      await tx.notification.deleteMany({ where: { projectRequestId: id } });

      await tx.projectRequest.delete({ where: { id } });
    });

    this.logger.log(`Request ${id} permanently deleted by ${user.email}`);
    return { message: 'Project permanently deleted successfully' };
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

    // A client only gets a phase's deliverables folder URL once that phase is
    // paid for. Stripping it here rather than in the UI is the point — a hidden
    // button still ships the link in the response body. Staff see everything.
    if (user.role === UserRole.USER) {
      const unlocked = await this.unlockedStageIds(requests.map((r) => r.id));
      for (const request of requests) {
        for (const stage of request.stages) {
          if (!unlocked.has(stage.id)) stage.driveLink = null;
        }
      }
    }

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

    // 3b. Phase-scoped meetings: only allowed post-acceptance, and gated on
    // payment for INSTALLMENT proposals (LUMP_SUM proposals are unrestricted).
    if (dto.stageId) {
      const stage = await this.prisma.projectStage.findUnique({
        where: { id: dto.stageId },
        include: { proposal: true },
      });

      if (!stage || !stage.proposal || stage.proposal.projectRequestId !== dto.projectRequestId) {
        throw new NotFoundException('Project stage not found for this project');
      }

      if (stage.proposal.status !== 'ACCEPTED') {
        throw new ForbiddenException(
          'This phase cannot be scheduled until its contract has been accepted.',
        );
      }

      const isInstallment =
        stage.proposal.paymentType === 'INSTALLMENT' ||
        stage.proposal.paymentMethod === 'INSTALLMENT' ||
        stage.proposal.paymentMethod === 'installments';

      if (isInstallment) {
        const completedPayment = await this.prisma.payment.findFirst({
          where: {
            stageId: dto.stageId,
            paymentStatus: 'COMPLETED',
          },
        });

        if (!completedPayment) {
          throw new ForbiddenException(
            'Client must complete payment for this phase before a meeting can be scheduled.',
          );
        }
      }
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
        status: 'PENDING_RESPONSE',
        stageId: dto.stageId || null,
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

  /**
   * Accept or reject a pending meeting — whoever DIDN'T send/propose it is
   * the one allowed to respond: staff respond to PENDING_CLIENT_REQUEST
   * (client-proposed dates), the owning client responds to PENDING_RESPONSE
   * (PM-proposed dates/links). Rejecting doesn't mutate the row further —
   * the sender re-proposes via a fresh sendMeetingLink/requestMeeting call.
   */
  async respondToMeeting(
    meetingId: string,
    action: 'accept' | 'reject',
    user: User,
  ) {
    const meeting = await this.prisma.meetingLink.findUnique({
      where: { id: meetingId },
      include: { projectRequest: true },
    });

    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }

    if (meeting.status === 'PENDING_CLIENT_REQUEST') {
      if (!this.canManageRequests(user)) {
        throw new ForbiddenException('Only staff can respond to a client meeting request');
      }
    } else if (meeting.status === 'PENDING_RESPONSE') {
      if (meeting.projectRequest.userId !== user.id) {
        throw new ForbiddenException('Only the project client can respond to this meeting');
      }
    } else {
      throw new BadRequestException('This meeting has already been responded to');
    }

    const newStatus: MeetingStatus = action === 'accept' ? 'ACCEPTED' : 'DECLINED';

    const updated = await this.prisma.meetingLink.update({
      where: { id: meetingId },
      data: { status: newStatus },
      include: {
        sentByUser: { select: { id: true, name: true, email: true, role: true } },
        sentToUser: { select: { id: true, name: true, email: true } },
        projectRequest: { select: { id: true, projectName: true, status: true } },
      },
    });

    // Notify whoever sent/proposed the meeting — the "other side" of
    // whichever direction just responded.
    try {
      await this.notificationService.createNotification({
        userId: meeting.sentByUserId,
        type: action === 'accept' ? 'MEETING_ACCEPTED' : 'MEETING_DECLINED',
        title: action === 'accept' ? 'Meeting Confirmed' : 'Meeting Declined',
        message:
          action === 'accept'
            ? `"${meeting.title}" for ${meeting.projectRequest.projectName} has been confirmed.`
            : `"${meeting.title}" for ${meeting.projectRequest.projectName} was declined. Please propose a new time.`,
        link: `/dashboard?project=${meeting.projectRequestId}`,
        projectRequestId: meeting.projectRequestId,
      });
    } catch (error) {
      this.logger.error(`Failed to notify meeting response for ${meetingId}`, error);
    }

    this.logger.log(`Meeting ${meetingId} ${newStatus.toLowerCase()} by ${user.email}`);

    return {
      success: true,
      message: action === 'accept' ? 'Meeting accepted' : 'Meeting declined',
      data: updated,
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
      meetingUrl: string | null;
      title: string;
      scheduledAt: Date;
      notes?: string | null;
      emailSent: boolean;
      createdAt: Date;
      status: MeetingStatus;
      stageId: string | null;
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
        status: true,
        stageId: true,
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

  async checkEmailExists(email: string, staffUser: User) {
    if (!this.canManageRequests(staffUser)) {
      throw new ForbiddenException('Access denied');
    }

    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { role: true, emailVerified: true, password: true },
    });

    const hasPassword = !!user?.password;

    return {
      exists: !!user,
      emailVerified: user?.emailVerified ?? false,
      role: user?.role ?? null,
      hasPassword,
      // The PM is only asked for a password when there is no account yet, or
      // the account exists but has no credentials to log in with. An account
      // that already has a password is never overwritten, verified or not.
      needsPassword: !user || !hasPassword,
    };
  }

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
      password?: string;
    },
    staffUser: User,
  ) {
    if (!this.canManageRequests(staffUser)) {
      throw new ForbiddenException('Access denied');
    }

    const { clientInfo, projectInfo, password } = body;

    if (!clientInfo.email) {
      throw new BadRequestException('Email is required');
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
    const normalizedEmail = clientInfo.email.toLowerCase().trim();

    // Use a transaction to create user + project request atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Check if user exists
      let clientUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      let passwordSet = false;

      if (clientUser) {
        if (clientUser.role !== 'USER') {
          throw new BadRequestException(
            'An account with this email already exists as a staff user. Cannot create a client inquiry for it.',
          );
        }

        if (clientUser.password) {
          // Existing client who already has their own credentials — never
          // touch their password. Only make sure the account can actually be
          // logged into, since a staff member is vouching for the email here.
          if (!clientUser.emailVerified) {
            clientUser = await tx.user.update({
              where: { id: clientUser.id },
              data: { emailVerified: true },
            });
            this.logger.log(`User ${normalizedEmail} already had a password but was unverified, verified without password change`);
          } else {
            this.logger.log(`User ${normalizedEmail} already exists and is verified, linking inquiry without password change`);
          }
        } else {
          // Account exists but has no password to log in with — set one.
          if (!password || password.length < 6) {
            throw new BadRequestException(
              'This email has an account with no password set. A password of at least 6 characters is required to activate it.',
            );
          }
          const hashedPassword = await bcrypt.hash(password, 12);
          clientUser = await tx.user.update({
            where: { id: clientUser.id },
            data: {
              password: hashedPassword,
              emailVerified: true,
            },
          });
          passwordSet = true;
          this.logger.log(`User ${normalizedEmail} already existed without a password, activated with new password`);
        }
      } else {
        // 2. Create user account with password
        if (!password || password.length < 6) {
          throw new BadRequestException('Password must be at least 6 characters');
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        clientUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: `${clientInfo.firstName} ${clientInfo.lastName}`.trim(),
            password: hashedPassword,
            role: 'USER',
            emailVerified: true, // auto-verified since PM creates the account
          },
        });
        passwordSet = true;
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

      return { clientUser, projectRequest, passwordSet };
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
          password: result.passwordSet ? password : undefined,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to send welcome email for inquiry ${result.projectRequest.id}`, error);
    }

    return {
      success: true,
      message: result.passwordSet
        ? 'New inquiry created successfully. Client account has been set up.'
        : "New inquiry created successfully and linked to the client's existing account.",
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
    dto: { scheduledAt: string; notes?: string; stageId?: string },
    user: User,
  ) {
    // 1. Find the project request and verify ownership
    const projectRequest = await this.prisma.projectRequest.findFirst({
      where: { id: projectRequestId, userId: user.id, deletedAt: null },
    });

    if (!projectRequest) {
      throw new NotFoundException('Project request not found or not owned by you');
    }

    if (!projectRequest.consultationPaymentId) {
      throw new ForbiddenException(
        'Please pay the consultation fee before requesting a meeting.',
      );
    }

    // 1b. A phase progress meeting has extra preconditions: the phase must be
    // finished, and on an installment plan the client must have paid for it.
    let stage: { id: string; name: string; status: string } | null = null;
    if (dto.stageId) {
      stage = await this.prisma.projectStage.findFirst({
        where: { id: dto.stageId, projectRequestId },
        select: { id: true, name: true, status: true },
      });

      if (!stage) {
        throw new NotFoundException('Phase not found for this project');
      }

      if (stage.status !== 'COMPLETED') {
        throw new BadRequestException(
          'This phase is not complete yet, so a progress meeting cannot be booked.',
        );
      }

      const acceptedProposal = await this.prisma.proposal.findFirst({
        where: {
          projectRequestId,
          status: ProposalStatus.ACCEPTED,
        },
        select: { id: true, paymentMethod: true, paymentType: true },
      });

      if (!acceptedProposal) {
        throw new BadRequestException(
          'Phase meetings become available once your contract is approved.',
        );
      }

      const isLumpSum =
        acceptedProposal.paymentMethod === 'lumpSum' ||
        acceptedProposal.paymentMethod === 'LUMP_SUM' ||
        acceptedProposal.paymentType === 'LUMP_SUM';

      if (!isLumpSum) {
        const paidForStage = await this.prisma.payment.findFirst({
          where: {
            projectRequestId,
            stageId: dto.stageId,
            paymentStatus: 'COMPLETED',
          },
          select: { id: true },
        });

        if (!paidForStage) {
          throw new BadRequestException(
            'Please complete the payment for this phase before booking its meeting.',
          );
        }
      }
    }

    // 2. Find managers to notify
    const managers = await this.prisma.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'] },
        isActive: true,
      },
      select: { id: true, email: true, name: true },
    });

    // 3. Create a MeetingLink as a client request, awaiting PM response
    await this.prisma.meetingLink.create({
      data: {
        projectRequestId: projectRequestId,
        sentByUserId: user.id,
        sentToUserId: user.id, // placeholder - the client themselves
        stageId: dto.stageId || null,
        meetingUrl: null,
        status: 'PENDING_CLIENT_REQUEST',
        title: stage
          ? `${stage.name} — Progress Meeting Requested`
          : 'Meeting Requested by Client',
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
      // Opens the project on the Meeting Request tab.
      link: staffProjectLink(projectRequestId, 'meeting'),
      projectRequestId,
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

  /**
   * Every meeting across all projects, for the Master Schedule calendar.
   * Super Admin / Admin see everything and may filter to one manager; a PM only
   * ever sees the projects assigned to them.
   */
  async getMasterSchedule(
    user: User,
    opts: { managerId?: string; from?: string; to?: string },
  ) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    const isPrivileged =
      user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

    // A PM is locked to their own schedule regardless of what they ask for.
    const managerFilter = isPrivileged ? opts.managerId : user.id;

    const where: Prisma.MeetingLinkWhereInput = {
      ...(opts.from || opts.to
        ? {
            scheduledAt: {
              ...(opts.from ? { gte: new Date(opts.from) } : {}),
              ...(opts.to ? { lte: new Date(opts.to) } : {}),
            },
          }
        : {}),
      ...(managerFilter
        ? { projectRequest: { assignedManagerId: managerFilter } }
        : {}),
    };

    const meetings = await this.prisma.meetingLink.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        notes: true,
        status: true,
        meetingUrl: true,
        stageId: true,
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            clientFirstName: true,
            clientLastName: true,
            assignedManagerId: true,
            assignedManager: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return {
      success: true,
      message: 'Master schedule retrieved',
      data: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduledAt,
        notes: m.notes,
        status: m.status,
        meetingUrl: m.meetingUrl,
        stageId: m.stageId,
        projectRequestId: m.projectRequest?.id ?? null,
        projectName: m.projectRequest?.projectName ?? 'Unassigned project',
        clientName: [
          m.projectRequest?.clientFirstName,
          m.projectRequest?.clientLastName,
        ]
          .filter(Boolean)
          .join(' '),
        managerId: m.projectRequest?.assignedManagerId ?? null,
        managerName: m.projectRequest?.assignedManager?.name ?? null,
      })),
    };
  }

  /**
   * Client opts out of (or back into) the progress meeting for a phase.
   * This never affects what they owe — an installment is still due.
   */
  async setPhaseMeetingBypass(stageId: string, bypassed: boolean, user: User) {
    const stage = await this.prisma.projectStage.findUnique({
      where: { id: stageId },
      select: {
        id: true,
        projectRequestId: true,
        projectRequest: { select: { userId: true } },
      },
    });

    if (!stage) {
      throw new NotFoundException('Phase not found');
    }

    const isOwner = stage.projectRequest?.userId === user.id;
    if (!isOwner && !this.canManageRequests(user)) {
      throw new ForbiddenException('You cannot change this phase');
    }

    await this.prisma.projectStage.update({
      where: { id: stageId },
      data: { clientBypassedMeeting: bypassed },
    });

    return {
      success: true,
      message: bypassed
        ? 'Meeting skipped for this phase.'
        : 'Meeting re-enabled for this phase.',
    };
  }

  /**
   * PM includes or excludes the progress meeting requirement for a phase.
   */
  async setPhaseMeetingRequired(
    stageId: string,
    meetingRequired: boolean,
    user: User,
  ) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Only staff can change meeting requirements');
    }

    const stage = await this.prisma.projectStage.findUnique({
      where: { id: stageId },
      select: { id: true },
    });

    if (!stage) {
      throw new NotFoundException('Phase not found');
    }

    await this.prisma.projectStage.update({
      where: { id: stageId },
      data: { meetingRequired },
    });

    return {
      success: true,
      message: meetingRequired
        ? 'Progress meeting is now required for this phase.'
        : 'Progress meeting is no longer required for this phase.',
    };
  }

  /**
   * Lets a client pay the consultation fee for a project that was created
   * on their behalf by a PM/Admin (createNewInquiry), after the fact —
   * required before they can request a meeting (see requestMeeting above).
   */
  async attachConsultationPayment(
    projectRequestId: string,
    paymentIntentId: string,
    user: User,
  ) {
    const projectRequest = await this.prisma.projectRequest.findFirst({
      where: { id: projectRequestId, userId: user.id, deletedAt: null },
    });

    if (!projectRequest) {
      throw new NotFoundException('Project request not found or not owned by you');
    }

    if (projectRequest.consultationPaymentId) {
      return {
        success: true,
        message: 'Consultation fee already paid.',
        data: projectRequest,
      };
    }

    await this.paymentService.verifyConsultationPayment(paymentIntentId, user.id);

    const updated = await this.prisma.projectRequest.update({
      where: { id: projectRequestId },
      data: { consultationPaymentId: paymentIntentId },
    });

    this.logger.log(
      `Consultation fee attached to project ${projectRequestId} by ${user.email}`,
    );

    return {
      success: true,
      message: 'Consultation fee payment confirmed.',
      data: updated,
    };
  }
}
