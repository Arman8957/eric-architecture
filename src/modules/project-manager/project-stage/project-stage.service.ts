
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';

import { UserRole, User, StageStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailerService } from 'src/utils/email/email.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { CompleteStageDto } from './dto/complete-stage.dto';

@Injectable()
export class ProjectStageService {
  private readonly logger = new Logger(ProjectStageService.name);

  private readonly REQUEST_MANAGERS = new Set<UserRole>([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROJECT_MANAGER,
  ]);

  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
  ) {}

  private canManageStages(user: User): boolean {
    return this.REQUEST_MANAGERS.has(user.role);
  }


  async create(dto: CreateStageDto, user: User) {
    if (!this.canManageStages(user)) {
      throw new ForbiddenException('Access denied');
    }

    // Verify proposal exists
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: dto.proposalId },
      include: { user: true },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }


    if (dto.assignedToId) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: dto.assignedToId },
      });

      if (!assignedUser) {
        throw new NotFoundException('Assigned user not found');
      }
    }


    let order = dto.order ?? 0;
    if (dto.order === undefined) {
      const maxOrder = await this.prisma.projectStage.aggregate({
        where: { proposalId: dto.proposalId },
        _max: { order: true },
      });
      order = (maxOrder._max.order ?? -1) + 1;
    }

   
    const data: Prisma.ProjectStageCreateInput = {
      proposal: { connect: { id: dto.proposalId } },
      name: dto.name,
      description: dto.description,
      order,
      totalTasks: dto.totalTasks ?? 0,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assignedTo: dto.assignedToId ? { connect: { id: dto.assignedToId } } : undefined,
      notes: dto.notes,
      status: StageStatus.NOT_STARTED,
    };

    const stage = await this.prisma.projectStage.create({
      data,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        proposal: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    this.logger.log(
      `Stage "${dto.name}" created for proposal ${dto.proposalId} by ${user.email}`,
    );

    return stage;
  }


  async update(id: string, dto: UpdateStageDto, user: User) {
    if (!this.canManageStages(user)) {
      throw new ForbiddenException('Access denied');
    }

    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
      include: {
        proposal: {
          include: { user: true },
        },
      },
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    // Verify assigned user if changed
    if (dto.assignedToId) {
      const assignedUser = await this.prisma.user.findUnique({
        where: { id: dto.assignedToId },
      });

      if (!assignedUser) {
        throw new NotFoundException('Assigned user not found');
      }
    }

    let status = dto.status ?? stage.status;
    const progress = dto.progress ?? stage.progress;

    if (progress > 0 && status === StageStatus.NOT_STARTED) {
      status = StageStatus.IN_PROGRESS;
    }

 
    const updateData: Prisma.ProjectStageUpdateInput = {
      name: dto.name,
      description: dto.description,
      order: dto.order,
      status,
      progress,
      totalTasks: dto.totalTasks,
      completedTasks: dto.completedTasks,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assignedTo: dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : undefined,
      notes: dto.notes,
    };

    const updated = await this.prisma.projectStage.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        proposal: {
          include: {
            user: true,
          },
        },
      },
    });

    return updated;
  }

  
  async updateProgress(id: string, dto: UpdateProgressDto, user: User) {
    if (!this.canManageStages(user)) {
      throw new ForbiddenException('Access denied');
    }

    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
      include: {
        proposal: {
          include: { user: true },
        },
      },
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    // Auto-update status
    let status = stage.status;
    if (dto.progress === 100) {
      status = StageStatus.COMPLETED;
    } else if (dto.progress > 0 && status === StageStatus.NOT_STARTED) {
      status = StageStatus.IN_PROGRESS;
    }

    const updated = await this.prisma.projectStage.update({
      where: { id },
      data: {
        progress: dto.progress,
        completedTasks: dto.completedTasks,
        status,
        completedAt: status === StageStatus.COMPLETED ? new Date() : null,
        notes: dto.notes
          ? `${stage.notes || ''}\n\n[${new Date().toISOString()}] ${dto.notes}`
          : stage.notes,
      },
      include: {
        proposal: {
          include: { user: true },
        },
      },
    });

    // If completed, notify client
    if (status === StageStatus.COMPLETED && stage.status !== StageStatus.COMPLETED) {
      await this.notifyStageCompleted(updated);
    }

    return updated;
  }

  async completeStage(id: string, dto: CompleteStageDto, user: User) {
    if (!this.canManageStages(user)) {
      throw new ForbiddenException('Access denied');
    }

    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
      include: {
        proposal: {
          include: { user: true },
        },
      },
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    if (stage.status === StageStatus.COMPLETED) {
      throw new BadRequestException('Stage already completed');
    }

    const updated = await this.prisma.projectStage.update({
      where: { id },
      data: {
        status: StageStatus.COMPLETED,
        progress: 100,
        completedTasks: stage.totalTasks,
        completedAt: new Date(),
        notes: dto.notes
          ? `${stage.notes || ''}\n\n[Completed] ${dto.notes}`
          : stage.notes,
      },
      include: {
        proposal: {
          include: {
            user: true,
            projectStages: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    // Notify client
    await this.notifyStageCompleted(updated);

    this.logger.log(
      `Stage "${stage.name}" completed for proposal ${stage.proposalId}`,
    );

    return updated;
  }


  private async notifyStageCompleted(stage: any) {
    try {
      const { proposal } = stage;

 
      if (!proposal) {
        this.logger.warn(`Stage ${stage.id} has no linked proposal`);
        return;
      }

      // Calculate overall progress
      const stages = proposal.projectStages || [];
      const completedCount = stages.filter(
        (s: any) => s.status === StageStatus.COMPLETED,
      ).length;
      const totalCount = stages.length;

      await this.mailer.sendStageCompletionEmail(
        proposal.user.email,
        proposal.user.name || 'Client',
        {
          stageName: stage.name,
          projectName: proposal.projectName,
          proposalNumber: proposal.proposalNumber,
          completedCount,
          totalCount,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard/proposals/${proposal.id}`,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to send stage completion email for stage ${stage.id}`,
        error,
      );
    }
  }


  async getStagesByProposal(proposalId: string, user: User) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Check permissions
    if (!this.canManageStages(user) && proposal.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.projectStage.findMany({
      where: { proposalId },
      orderBy: { order: 'asc' },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });
  }


  async findOne(id: string, user: User) {
    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        proposal: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            projectStages: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                name: true,
                status: true,
                progress: true,
              },
            },
          },
        },
      },
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    if (!stage.proposal) {
      throw new NotFoundException('Stage is not linked to any proposal');
    }

    // Check permissions
    if (!this.canManageStages(user) && stage.proposal.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return stage;
  }


  async deleteStage(id: string, user: User) {
    if (!this.canManageStages(user)) {
      throw new ForbiddenException('Access denied');
    }

    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    await this.prisma.projectStage.delete({
      where: { id },
    });

    this.logger.log(`Stage ${id} deleted by ${user.email}`);

    return { message: 'Stage deleted successfully' };
  }

 
  async getMyAssignedStages(user: User) {
    return this.prisma.projectStage.findMany({
      where: {
        assignedToId: user.id,
        status: {
          in: [StageStatus.NOT_STARTED, StageStatus.IN_PROGRESS],
        },
      },
      orderBy: [{ dueDate: 'asc' }, { order: 'asc' }],
      include: {
        proposal: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }
}