
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';

import { UserRole, User, StageStatus, RequestStatus, ProposalStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailerService } from 'src/utils/email/email.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { DeadlineReminderService } from './deadline-reminder.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { CompleteStageDto } from './dto/complete-stage.dto';
import { clientProjectLink } from 'src/common/notification-links';

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
    private notificationService: NotificationService,
    private deadlineReminderService: DeadlineReminderService,
  ) { }

  private canManageStages(user: User): boolean {
    return this.REQUEST_MANAGERS.has(user.role) || user.role === UserRole.DRAFTER || user.role === UserRole.EMPLOYEE;
  }

  private async isAssignedToProject(stageId: string, user: User): Promise<boolean> {
    if (this.REQUEST_MANAGERS.has(user.role)) return true;

    const stage = await this.prisma.projectStage.findUnique({
      where: { id: stageId },
      include: {
        proposal: {
          include: {
            projectRequest: {
              include: {
                teams: {
                  include: { members: true }
                }
              }
            }
          }
        }
      }
    });

    if (!stage || !stage.proposal?.projectRequest) return false;

    return stage.proposal.projectRequest.teams.some(team => 
      team.members.some(member => member.id === user.id)
    );
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

    if (!(await this.isAssignedToProject(id, user))) {
      throw new ForbiddenException('You are not assigned to this project team');
    }

    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
      include: {
        proposal: {
          include: {
            user: true,
            projectRequest: true,
          },
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

    // Track old deadlines for change detection
    const oldInternalDeadline = stage.internalDeadline;
    const oldExternalDeadline = stage.externalDeadline;

    const updateData: Prisma.ProjectStageUpdateInput = {
      name: dto.name,
      description: dto.description,
      order: dto.order,
      status,
      progress,
      // A phase finished through this route records when it finished, the same
      // as the Complete button does — the project's end date is derived from
      // these, so a phase without one leaves a hole.
      ...(status === StageStatus.COMPLETED && stage.status !== StageStatus.COMPLETED
        ? { completedAt: new Date() }
        : {}),
      totalTasks: dto.totalTasks,
      completedTasks: dto.completedTasks,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      assignedTo: dto.assignedToId
        ? { connect: { id: dto.assignedToId } }
        : undefined,
      notes: dto.notes,
      ...(dto.internalDeadline !== undefined && {
        internalDeadline: dto.internalDeadline ? new Date(dto.internalDeadline) : null,
      }),
      ...(dto.externalDeadline !== undefined && {
        externalDeadline: dto.externalDeadline ? new Date(dto.externalDeadline) : null,
      }),
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
            projectRequest: true,
          },
        },
      },
    });

    // Handle internal deadline change -> generate reminders for assigned PM
    if (dto.internalDeadline !== undefined) {
      const newDeadline = dto.internalDeadline ? new Date(dto.internalDeadline) : null;
      if (newDeadline) {
        // Find the assigned manager for this project
        const projectRequest = updated.proposal?.projectRequest as any;
        const targetUserId = projectRequest?.assignedManagerId || user.id;
        await this.deadlineReminderService.generateReminders(
          id,
          'INTERNAL',
          newDeadline,
          targetUserId,
        );
      } else {
        // Deadline removed: cancel pending reminders
        await this.deadlineReminderService.cancelRemindersForStageType(id, 'INTERNAL');
      }
    }

    // Handle external deadline change -> generate reminders for client + notify about change
    if (dto.externalDeadline !== undefined) {
      const newDeadline = dto.externalDeadline ? new Date(dto.externalDeadline) : null;
      if (newDeadline) {
        // Find the client user
        const clientUserId = updated.proposal?.userId;
        if (clientUserId) {
          await this.deadlineReminderService.generateReminders(
            id,
            'EXTERNAL',
            newDeadline,
            clientUserId,
          );

          // Notify client about external deadline change (only if it actually changed)
          if (oldExternalDeadline && oldExternalDeadline.getTime() !== newDeadline.getTime()) {
            const projectName =
              (updated.proposal?.projectRequest as any)?.projectName ||
              updated.proposal?.projectName ||
              'Unknown Project';

            const oldDateStr = oldExternalDeadline.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            const newDateStr = newDeadline.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });

            await this.notificationService.createNotification({
              userId: clientUserId,
              type: 'EXTERNAL_DEADLINE_CHANGED',
              title: `Deadline Changed: ${updated.name}`,
              message: `External deadline for "${updated.name}" changed from ${oldDateStr} to ${newDateStr} in project "${projectName}".`,
              link: clientProjectLink(
                (updated.proposal?.projectRequest as any)?.id || '',
                'details',
              ),
              projectRequestId: (updated.proposal?.projectRequest as any)?.id || null,
            });

            this.logger.log(
              `Notified client ${clientUserId} about external deadline change for stage "${updated.name}"`,
            );
          }
        }
      } else {
        // Deadline removed: cancel pending reminders
        await this.deadlineReminderService.cancelRemindersForStageType(id, 'EXTERNAL');
      }
    }

    // Setting the status straight to COMPLETED here finishes a phase just as
    // the Complete button and a drag to 100% do, so it has to run the same
    // project-wide check. Without this the last phase could be ticked off from
    // the edit form and the project would never stop its timer.
    if (
      status === StageStatus.COMPLETED &&
      stage.status !== StageStatus.COMPLETED &&
      stage.proposal?.projectRequestId
    ) {
      try {
        await this.maybeAutoCompleteProject(stage.proposal.projectRequestId);
      } catch (error) {
        this.logger.error(
          `Failed auto-complete check for project ${stage.proposal.projectRequestId}`,
          error,
        );
      }
    }

    return updated;
  }


  async updateProgress(id: string, dto: UpdateProgressDto, user: User) {
    if (!this.canManageStages(user)) {
      throw new ForbiddenException('Access denied');
    }

    if (!(await this.isAssignedToProject(id, user))) {
      throw new ForbiddenException('You are not assigned to this project team');
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

    // If completed, notify client and cancel reminders
    if (status === StageStatus.COMPLETED && stage.status !== StageStatus.COMPLETED) {
      await this.notifyStageCompleted(updated);
      await this.deadlineReminderService.cancelAllRemindersForStage(id);

      // Dragging progress to 100 finishes a phase just as "Complete" does, so
      // it has to run the same project-wide completion check.
      if (stage.proposal?.projectRequestId) {
        try {
          await this.maybeAutoCompleteProject(stage.proposal.projectRequestId);
        } catch (error) {
          this.logger.error(
            `Failed auto-complete check for project ${stage.proposal.projectRequestId}`,
            error,
          );
        }
      }
    }

    return updated;
  }

  async completeStage(id: string, dto: CompleteStageDto, user: User) {
    if (!this.canManageStages(user)) {
      throw new ForbiddenException('Access denied');
    }

    if (!(await this.isAssignedToProject(id, user))) {
      throw new ForbiddenException('You are not assigned to this project team');
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

    // Cancel all pending deadline reminders for this completed stage
    await this.deadlineReminderService.cancelAllRemindersForStage(id);

    this.logger.log(
      `Stage "${stage.name}" completed for proposal ${stage.proposalId}`,
    );

    // Best-effort: auto-complete the parent project if every phase across
    // every accepted proposal is now done. Never let a failure here block
    // the stage-completion response above.
    if (stage.proposal) {
      try {
        await this.maybeAutoCompleteProject(stage.proposal.projectRequestId);
      } catch (error) {
        this.logger.error(
          `Failed auto-complete check for project ${stage.proposal.projectRequestId}`,
          error,
        );
      }
    }

    return updated;
  }

  /**
   * If every ProjectStage across every ACCEPTED proposal for this project
   * is COMPLETED, mark the project itself COMPLETED and capture the
   * project's total duration (used later by the financial tab).
   */
  private async maybeAutoCompleteProject(projectRequestId: string) {
    const acceptedProposals = await this.prisma.proposal.findMany({
      where: { projectRequestId, status: ProposalStatus.ACCEPTED },
      include: { projectStages: true },
    });

    const allStages = acceptedProposals.flatMap((p) => p.projectStages);
    if (allStages.length === 0) return;

    const allComplete = allStages.every(
      (s) => s.status === StageStatus.COMPLETED,
    );
    if (!allComplete) return;

    const projectRequest = await this.prisma.projectRequest.findUnique({
      where: { id: projectRequestId },
      select: { status: true, projectStartedAt: true, projectCompletedAt: true },
    });

    // Idempotency keys off the end date — the thing this method writes — and
    // not off the status. A project can reach COMPLETED status by hand before
    // its last phase is ticked off; keying off the status there meant this
    // returned early and the end date was never stamped at all, so the timer
    // ran forever and the year-end split had no date to settle on.
    if (!projectRequest || projectRequest.projectCompletedAt) {
      return;
    }

    const completedAt = new Date();
    const totalDurationMonths = this.durationMonthsBetween(
      projectRequest.projectStartedAt,
      completedAt,
    );

    if (totalDurationMonths === null) {
      this.logger.warn(
        `Project ${projectRequestId} auto-completed with no projectStartedAt set`,
      );
    }

    await this.prisma.projectRequest.update({
      where: { id: projectRequestId },
      data: {
        status: RequestStatus.COMPLETED,
        projectCompletedAt: completedAt,
        totalDurationMonths,
      },
    });

    this.logger.log(`Project ${projectRequestId} auto-completed (all phases done)`);
  }

  /** Whole months between two dates, on the 30.44-day average used elsewhere. */
  private durationMonthsBetween(start: Date | null, end: Date): number | null {
    if (!start) return null;
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
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

      // 1. Send stage completion email
      await this.mailer.sendStageCompletionEmail(
        proposal.user.email,
        proposal.user.name || 'Client',
        {
          stageName: stage.name,
          projectName: proposal.projectName,
          proposalNumber: proposal.proposalNumber,
          completedCount,
          totalCount,
          dashboardUrl: `${process.env.FRONTEND_URL}/user-dashboard`,
        },
      );

      // 2. If installment mode, notify for next phase payment
      const isInstallment = proposal.paymentMethod === 'installments' || 
                           proposal.paymentMethod === 'INSTALLMENT' ||
                           proposal.paymentType === 'INSTALLMENT';

      if (isInstallment && completedCount < totalCount) {
        // Find next stage
        const sortedStages = [...stages].sort((a, b) => a.order - b.order);
        const currentIndex = sortedStages.findIndex(s => s.id === stage.id);
        const nextStage = sortedStages[currentIndex + 1];

        if (nextStage) {
          // Find next stage price from services
          const nextStagePrice = proposal.services?.[currentIndex + 1]?.amount || 0;

          await this.mailer.sendPhasePaymentReminder(
            proposal.user.email,
            proposal.user.name || 'Client',
            {
              completedPhaseName: stage.name,
              nextPhaseName: nextStage.name,
              projectName: proposal.projectName,
              amount: Number(nextStagePrice),
              dashboardUrl: `${process.env.FRONTEND_URL}/user-dashboard`,
            },
          );

          // Internal notification
          await this.notificationService.createNotification({
            userId: proposal.userId,
            type: 'PAYMENT_REMINDER',
            title: 'Payment Required',
            message: `"${stage.name}" is completed. Please pay for "${nextStage.name}" to proceed.`,
            link: clientProjectLink(proposal.projectRequestId, 'meetings'),
            projectRequestId: proposal.projectRequestId,
          });
        }
      }

      // Completing a project is deliberately NOT decided here. `proposal` is a
      // single contract, and a project can hold several — the original plus an
      // amendment per approved change request. Finishing the amendment's one
      // phase does not finish the project. maybeAutoCompleteProject() owns that
      // call and weighs every phase of every accepted proposal.
    } catch (error) {
      this.logger.error(
        `Failed to handle stage completion tasks for stage ${stage.id}`,
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


  async addInternalNote(id: string, note: string, user: User) {
    if (!this.canManageStages(user)) {
      throw new ForbiddenException('Access denied');
    }

    if (!(await this.isAssignedToProject(id, user))) {
      throw new ForbiddenException('You are not assigned to this project team');
    }

    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    const timestamp = new Date().toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    const noteHeader = `[${timestamp} - ${user.name || user.email}]`;
    const newNotes = stage.notes 
      ? `${stage.notes}\n\n${noteHeader}\n${note}`
      : `${noteHeader}\n${note}`;

    const updated = await this.prisma.projectStage.update({
      where: { id },
      data: { notes: newNotes },
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

    this.logger.log(`Internal note added to stage ${id} by ${user.email}`);

    return updated;
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

  async startTimer(id: string, user: User) {
    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
      include: { proposal: { include: { projectRequest: true } } }
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    // Check if user is the assigned manager OR a team member
    const assignedManagerId = (stage.proposal?.projectRequest as any)?.assignedManagerId;
    const isTeamMember = await this.isAssignedToProject(id, user);
    
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN && assignedManagerId !== user.id && !isTeamMember) {
      throw new ForbiddenException('Only the assigned manager, admin, or team members can start the timer');
    }

    if (stage.activeTimerStart) {
      throw new BadRequestException('Timer is already running');
    }

    return this.prisma.projectStage.update({
      where: { id },
      data: {
        activeTimerStart: new Date(),
        timerUserId: user.id,
        status: stage.status === StageStatus.NOT_STARTED ? StageStatus.IN_PROGRESS : stage.status,
      },
    });
  }

  async stopTimer(id: string, user: User) {
    const stage = await this.prisma.projectStage.findUnique({
      where: { id },
      include: { proposal: { include: { projectRequest: true } } }
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    if (!stage.activeTimerStart) {
      throw new BadRequestException('Timer is not running');
    }

    // Check if user is the one who started it, manager, or team member
    const assignedManagerId = (stage.proposal?.projectRequest as any)?.assignedManagerId;
    const isTeamMember = await this.isAssignedToProject(id, user);

    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN && stage.timerUserId !== user.id && assignedManagerId !== user.id && !isTeamMember) {
       throw new ForbiddenException('Access denied to stop this timer');
    }

    const elapsedSeconds = Math.floor((new Date().getTime() - stage.activeTimerStart.getTime()) / 1000);
    const newAccumulatedTime = (stage.accumulatedTime || 0) + elapsedSeconds;

    return this.prisma.projectStage.update({
      where: { id },
      data: {
        accumulatedTime: newAccumulatedTime,
        activeTimerStart: null,
        timerUserId: null,
      },
    });
  }
}