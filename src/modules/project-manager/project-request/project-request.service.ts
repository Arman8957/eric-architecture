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
  ) {}

  private canManageRequests(user: User): boolean {
    return this.REQUEST_MANAGERS.has(user.role);
  }

  async findAll(query: QueryProjectRequestDto, user: User) {
    if (!this.canManageRequests(user)) {
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

    const where: Prisma.ProjectRequestWhereInput = {
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { projectName: { contains: search, mode: 'insensitive' } },
        { clientFirstName: { contains: search, mode: 'insensitive' } },
        { clientLastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }

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
        assets: {
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
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (!this.canManageRequests(user) && request.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return request;
  }

  async getRequestsByStatus(user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    const counts = await this.prisma.projectRequest.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: true,
    });

    return counts.reduce(
      (acc, item) => {
        acc[item.status] = item._count;
        return acc;
      },
      {} as Record<RequestStatus, number>,
    );
  }

  async updateStatus(id: string, dto: UpdateRequestStatusDto, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
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

  async deleteRequest(id: string, user: User) {
    if (!this.canManageRequests(user)) {
      throw new ForbiddenException('Access denied');
    }

    const request = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    await this.prisma.projectRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Request ${id} deleted by ${user.email}`);

    return { message: 'Request deleted successfully' };
  }

  async getMyRequests(user: User, query: QueryProjectRequestDto) {
    const { status, page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProjectRequestWhereInput = {
      userId: user.id,
      deletedAt: null,
    };

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
}
