import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { NotificationService } from 'src/modules/notification/notification.service';
import { clientProjectLink } from 'src/common/notification-links';
import {
  User,
  ProposalStatus,
  ProjectStatus,
  StageStatus,
  RequestStatus,
  UserRole,
  Prisma,
  ProjectCategory,
  ServiceApprovalStatus,
  ProposalType,
  AmendmentStatus,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { TX_OPTIONS } from 'src/common/prisma-transaction';
import { MailerService } from 'src/utils/email/email.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { AddProposalServiceDto } from './dto/add-proposal-service.dto';
import { ProposalSignatureDto } from './dto/proposal-signature.dto';
import { UpdateProposalServiceDto } from './dto/update-proposal-status.dto';
import {
  AddServiceWithApprovalDto,
  ApproveServiceDto,
} from './dto/service-approval.dto';

@Injectable()
export class ProposalService {
  private readonly logger = new Logger(ProposalService.name);

  private readonly MANAGER_ROLES = new Set<UserRole>([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROJECT_MANAGER,
  ]);

  // For Prisma queries
  private readonly MANAGER_ROLES_ARRAY: UserRole[] = [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROJECT_MANAGER,
  ];

  private readonly ALLOWED_SIGN_STATUSES = new Set<ProposalStatus>([
    ProposalStatus.SENT,
    ProposalStatus.VIEWED,
  ]);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mailer: MailerService,
    private notificationService: NotificationService,
  ) { }

  private canManage(user: User): boolean {
    return this.MANAGER_ROLES.has(user.role);
  }

  async create(dto: CreateProposalDto, user: User) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Only managers can create proposals');
    }

    const projectRequest = await this.prisma.projectRequest.findUnique({
      where: { id: dto.projectRequestId },
    });

    if (!projectRequest) {
      throw new NotFoundException('Project request not found');
    }

    const clientUserId = projectRequest.userId;

    // Optional: log warning or throw if no user is linked
    if (!clientUserId) {
      this.logger.warn(
        `Creating proposal without user link for request ${dto.projectRequestId} ` +
        `(client email: ${projectRequest.email})`,
      );
      // If you want to force a linked user → uncomment:
      // throw new BadRequestException('Cannot create proposal: no registered client user linked to this request');
    }

    // One proposal per project. Once a normal proposal has actually reached the
    // client, further scope changes go through the amendment flow instead of a
    // second proposal. A rejected or expired proposal releases the slot.
    const liveProposal = await this.prisma.proposal.findFirst({
      where: {
        projectRequestId: dto.projectRequestId,
        proposalType: ProposalType.NORMAL,
        status: {
          in: [
            ProposalStatus.SENT,
            ProposalStatus.VIEWED,
            ProposalStatus.ACCEPTED,
          ],
        },
      },
      select: { id: true, proposalNumber: true, status: true },
    });

    if (liveProposal) {
      throw new BadRequestException(
        `Proposal ${liveProposal.proposalNumber} has already been sent for this project. ` +
        `Use an amendment to change its scope.`,
      );
    }

    // The wizard's Project step is re-submitted whenever the PM steps back to
    // it, so an untouched DRAFT from an earlier pass is reused instead of
    // littering the project with empty proposals. Only a draft this same user
    // created for this same request, with nothing in it yet, ever qualifies.
    const reusableDraft = await this.prisma.proposal.findFirst({
      where: {
        projectRequestId: dto.projectRequestId,
        createdById: user.id,
        status: ProposalStatus.DRAFT,
        proposalType: ProposalType.NORMAL,
        services: { none: {} },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, proposalNumber: true },
    });

    if (reusableDraft) {
      this.logger.log(
        `Reusing empty draft ${reusableDraft.proposalNumber} for request ${dto.projectRequestId}`,
      );
      const reused = await this.update(reusableDraft.id, dto, user);
      return { ...reused, message: 'Proposal created successfully' };
    }

    const year = new Date().getFullYear();
    const prefix = `PROP-${year}-`;
    const lastProposal = await this.prisma.proposal.findFirst({
      where: { proposalNumber: { startsWith: prefix } },
      orderBy: { proposalNumber: 'desc' },
      select: { proposalNumber: true },
    });
    let nextNum = 1;
    if (lastProposal?.proposalNumber) {
      const numPart = lastProposal.proposalNumber.replace(prefix, '');
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed)) {
        nextNum = parsed + 1;
      }
    }
    const proposalNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;

    const locationParts = [
      dto.streetAddress,
      dto.city,
      dto.state,
      dto.country,
    ].filter(Boolean);
    const projectLocation = locationParts.join(', ') || '';

    const data: Prisma.ProposalCreateInput = {
      projectRequest: { connect: { id: dto.projectRequestId } },

      // ─── FIXED: This is the correct & reliable way ───
      user: clientUserId ? { connect: { id: clientUserId } } : undefined,

      proposalNumber,
      title: dto.name.trim(),
      projectName: dto.name.trim(),
      projectDescription: dto.description?.trim(),
      additionalContext: dto.additionalContext?.trim(),
      projectLocation,
      serviceType: dto.serviceType,
      projectCategory: dto.projectCategory,
      squareFootage: dto.squareFootage?.trim(),
      budgetRange: dto.budgetRange?.trim(),
      expectedTimeline: dto.expectedTimeline?.trim(),
      clientName:
        `${projectRequest.clientFirstName} ${projectRequest.clientLastName || ''}`.trim(),
      clientEmail: projectRequest.email,
      clientPhone: projectRequest.phone ?? undefined,
      clientCompany: projectRequest.companyName ?? undefined,
      taxRate: dto.taxRate ?? undefined,
      paymentMethod: dto.paymentMethod,
      paymentType: dto.paymentMethod === 'installments' || dto.paymentMethod === 'INSTALLMENT' 
        ? 'INSTALLMENT' 
        : 'LUMP_SUM',
      paymentTerms: dto.paymentTerms,
      notes: dto.notes?.trim(),
      termsAndConditions: dto.termsAndConditions?.trim(),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      createdBy: { connect: { id: user.id } },
      status: ProposalStatus.DRAFT,
    };

    const proposal = await this.prisma.proposal.create({
      data,
      include: {
        services: true,
        credits: true,
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            status: true,
            clientFirstName: true,
            clientLastName: true,
            email: true,
            phone: true,
            companyName: true,
          },
        },

        user: clientUserId
          ? {
            select: {
              id: true,
              name: true,
              email: true,
            },
          }
          : undefined,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    this.logger.log(
      `Proposal created: ${proposal.id} (${proposal.proposalNumber}) by ${user.email} ` +
      `(for request ${dto.projectRequestId}, client: ${proposal.clientName}, userId: ${proposal.userId || 'none'})`,
    );

    return {
      success: true,
      message: 'Proposal created successfully',
      data: proposal,
    };
  }

  async sign(id: string, dto: ProposalSignatureDto, user: User) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        projectRequest: true,
        services: { orderBy: { order: 'asc' } },
        user: true,
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (!this.ALLOWED_SIGN_STATUSES.has(proposal.status)) {
      throw new BadRequestException('Proposal must be SENT or VIEWED to sign');
    }

    let updateData: Prisma.ProposalUpdateInput = {};

    if (dto.type === 'owner') {
      if (user.id !== proposal.userId) {
        throw new ForbiddenException('Not authorized as owner');
      }
      updateData = {
        ownerSignature: dto.signature,
        ownerSignedAt: new Date(),
        ownerSignedBy: proposal.clientName,
      };
    } else if (dto.type === 'architect') {
      if (!this.canManage(user)) {
        throw new ForbiddenException('Not authorized as architect');
      }
      updateData = {
        architectSignature: dto.signature,
        architectSignedAt: new Date(),
        architectSignedBy: user.name || user.email,
      };
    } else {
      throw new BadRequestException('Invalid signature type');
    }

    // The transaction covers the writes only. Emails and other slow work run
    // after it commits — holding a transaction open across an SMTP round trip
    // is what exhausts its time budget and closes it mid-flight.
    const { updatedProposal, fullySigned } = await this.prisma.$transaction(async (tx) => {
      // Update proposal with signature
      const updatedProposal = await tx.proposal.update({
        where: { id },
        data: updateData,
        include: {
          services: { orderBy: { order: 'asc' } },
          projectRequest: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Check if both signatures are present
      const fullySigned = !!(
        updatedProposal.ownerSignature && updatedProposal.architectSignature
      );

      if (fullySigned) {
        // Mark proposal as accepted
        await tx.proposal.update({
          where: { id },
          data: {
            status: ProposalStatus.ACCEPTED,
            respondedAt: new Date(),
          },
        });

        // Auto-approve all services in this proposal
        await tx.proposalService.updateMany({
          where: { proposalId: id },
          data: {
            approvalStatus: ServiceApprovalStatus.APPROVED,
            approvedAt: new Date(),
          },
        });

        // services are already sorted by `order`; carry that value through so the
        // stage order in project management matches the proposal exactly.
        // One createMany rather than a create per service — each round trip
        // eats into the transaction's budget.
        let fallbackOrder = 1;
        await tx.projectStage.createMany({
          data: updatedProposal.services.map((service) => ({
            proposalId: updatedProposal.id,
            // Without this the stage is invisible to the project's phase list,
            // so it never counts toward the project's progress.
            projectRequestId: updatedProposal.projectRequestId,
            name: service.name,
            description: service.description || `Service: ${service.name}`,
            status: StageStatus.NOT_STARTED,
            order: service.order || fallbackOrder++,
            totalTasks: 5, // Default task count, can be updated later
            completedTasks: 0,
            progress: 0,
          })),
        });

        // Update project request to ACTIVE status
        if (updatedProposal.projectRequestId) {
          await this.updateProjectRequestStatus(
            tx,
            updatedProposal.projectRequestId,
            RequestStatus.ACTIVE,
          );
        }

        this.logger.log(
          `Proposal ${updatedProposal.proposalNumber} fully signed and accepted. Stages created.`,
        );
      }

      return { updatedProposal, fullySigned };
    }, TX_OPTIONS);

    if (fullySigned) {
      try {
        // Send notifications
        const frontendUrl = this.config.get(
          'FRONTEND_URL',
          'http://localhost:3000',
        );

        // Notify client
        await this.mailer.sendMail({
          to: updatedProposal.clientEmail,
          subject: `Proposal Accepted: ${updatedProposal.projectName}`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">🎉 Proposal Accepted!</h2>
            <p>Dear ${updatedProposal.clientName},</p>
            <p>Your proposal has been fully signed and accepted!</p>
            
            <div style="background: #f0fdf4; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0;">Project Details</h3>
              <p style="margin: 5px 0;"><strong>Project:</strong> ${updatedProposal.projectName}</p>
              <p style="margin: 5px 0;"><strong>Proposal:</strong> ${updatedProposal.proposalNumber}</p>
              <p style="margin: 5px 0;"><strong>Stages:</strong> ${updatedProposal.services.length}</p>
              <p style="margin: 5px 0;"><strong>Total Amount:</strong> $${Number(updatedProposal.totalAmount).toFixed(2)}</p>
            </div>
            
            <p>You can now track your project progress in your dashboard.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${frontendUrl}/dashboard/proposals/${updatedProposal.id}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                View Project Progress
              </a>
            </div>
            
            <p>We're excited to work with you!</p>
            <p>Best regards,<br>Your Architecture Team</p>
          </div>
        `,
          text: `Proposal "${updatedProposal.projectName}" accepted!\nView your dashboard: ${frontendUrl}/dashboard/proposals/${updatedProposal.id}`,
        });

        // Notify internal team
        const team = await this.prisma.user.findMany({
          where: {
            role: { in: this.MANAGER_ROLES_ARRAY },
            isActive: true,
          },
          select: { email: true, name: true },
        });

        for (const member of team) {
          await this.mailer.sendMail({
            to: member.email,
            subject: `Proposal Accepted: ${updatedProposal.projectName}`,
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">Proposal Accepted</h2>
              <p>Hello ${member.name || 'Team Member'},</p>
              <p>A proposal has been fully signed and accepted by the client.</p>
              
              <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Project:</strong> ${updatedProposal.projectName}</p>
                <p><strong>Client:</strong> ${updatedProposal.clientName}</p>
                <p><strong>Proposal:</strong> ${updatedProposal.proposalNumber}</p>
                <p><strong>Stages:</strong> ${updatedProposal.services.length}</p>
                <p><strong>Total:</strong> $${Number(updatedProposal.totalAmount).toFixed(2)}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${frontendUrl}/admin/proposals/${updatedProposal.id}" 
                   style="background: #2563eb; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; display: inline-block;">
                  View Proposal
                </a>
              </div>
            </div>
          `,
            text: `Proposal accepted: ${updatedProposal.projectName}\nClient: ${updatedProposal.clientName}\nView: ${frontendUrl}/admin/proposals/${updatedProposal.id}`,
          });
        }
      } catch (error) {
        // The signature is already committed — a bounced notification must not
        // fail the request or make the client think signing did not work.
        this.logger.error(
          `Proposal ${updatedProposal.proposalNumber} was signed, but the acceptance emails failed: ${error}`,
        );
      }
    }

    return updatedProposal;
  }

  async findOneWithFullData(id: string, user: User) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        services: {
          orderBy: { order: 'asc' },
        },
        credits: {
          orderBy: { createdAt: 'asc' },
        },
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            status: true,
            clientFirstName: true,
            clientLastName: true,
            email: true,
            phone: true,
            companyName: true,
            country: true,
            state: true,
            city: true,
            streetAddress: true,
            teams: { include: { members: true } },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        projectStages: {
          orderBy: { order: 'asc' },
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Check permissions - FIXED
    const isManager = this.canManage(user);
    const isOwner =
      proposal.userId === user.id || proposal.clientEmail === user.email;

    // Check if staff member of assigned team
    const isTeamMember = proposal.projectRequest?.teams?.some(team => 
      team.members?.some(member => member.id === user.id)
    );

    if (!isManager && !isOwner && !isTeamMember) {
      throw new ForbiddenException('Not authorized to view this proposal');
    }

    // Auto-mark as viewed if client views for first time
    if (
      isOwner &&
      proposal.status === ProposalStatus.SENT &&
      !proposal.viewedAt
    ) {
      await this.prisma.proposal.update({
        where: { id },
        data: {
          status: ProposalStatus.VIEWED,
          viewedAt: new Date(),
        },
      });
      proposal.status = ProposalStatus.VIEWED;
      proposal.viewedAt = new Date();
    }

    return {
      success: true,
      message: 'Successfully retrieved proposal details',
      data: proposal,
    };
  }

  // async findAll(user: User) {
  //   if (!this.canManage(user)) {
  //     throw new ForbiddenException('Access denied');
  //   }

  //   return this.prisma.proposal.findMany({
  //     include: {
  //       services: {
  //         orderBy: { order: 'asc' },
  //         select: {
  //           id: true,
  //           name: true,
  //           description: true,
  //           amount: true,
  //           order: true,
  //         },
  //       },
  //       projectRequest: {
  //         select: {
  //           id: true,
  //           projectName: true,
  //           status: true,
  //           clientFirstName: true,
  //           clientLastName: true,
  //         },
  //       },
  //       user: {
  //         select: {
  //           id: true,
  //           name: true,
  //           email: true,
  //           avatar: true,
  //         },
  //       },
  //       createdBy: {
  //         select: {
  //           id: true,
  //           name: true,
  //           email: true,
  //         },
  //       },
  //       projectStages: {
  //         select: {
  //           id: true,
  //           name: true,
  //           status: true,
  //           progress: true,
  //           totalTasks: true,
  //           completedTasks: true,
  //         },
  //         orderBy: { order: 'asc' },
  //       },
  //     },
  //     orderBy: { createdAt: 'desc' },
  //   });
  // }

  async findAll(user: User, includeApprovalStatus: boolean = true, projectRequestId?: string) {
    const isStaff = user.role === UserRole.DRAFTER || user.role === UserRole.EMPLOYEE;
    const isManager = this.canManage(user);

    if (!isManager && !isStaff) {
      throw new ForbiddenException('Access denied');
    }

    if (isStaff && projectRequestId) {
      // Verify they are in the team for this project
      const teams = await this.prisma.team.findMany({
        where: {
          projects: { some: { id: projectRequestId } },
          members: { some: { id: user.id } },
        },
      });
      
      if (teams.length === 0) {
        this.logger.warn(`Access denied for Staff ${user.id} (${user.role}) to project ${projectRequestId}. No team assignment found.`);
        throw new ForbiddenException('Access denied to this project proposal');
      }
    }

    const where: Prisma.ProposalWhereInput = {};
    if (projectRequestId) {
      where.projectRequestId = projectRequestId;
    }

    const proposals = await this.prisma.proposal.findMany({
      where,
      include: {
        services: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            amount: true,
            order: true,
            approvalStatus: true,
            requiresApproval: true,
            rejectionReason: true,
            approvedAt: true,
            rejectedAt: true,
          },
        },
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            status: true,
            clientFirstName: true,
            clientLastName: true,
            // Client contact + mailing address — shown in the proposal detail modal.
            companyName: true,
            email: true,
            phone: true,
            streetAddress: true,
            aptSuiteUnit: true,
            city: true,
            state: true,
            zipCode: true,
            country: true,
            additionalComments: true,
            // Project address + specifications, also shown in the detail modal.
            projectStreetAddress: true,
            projectAptSuiteUnit: true,
            projectZipCode: true,
            serviceType: true,
            projectCategory: true,
            projectSize: true,
            budgetRange: true,
            additionalNotes: true,
            siteConstraints: true,
            specialRequirements: true,
            // Drives the Location column on the All Proposals table.
            projectCity: true,
            projectState: true,
            projectCountry: true,
            // The project's run — Start Date / End Date / Total Days on the
            // All Proposals table, and the day-overlap split that shares a
            // contract across the calendar years the project spans.
            isProjectStarted: true,
            projectStartedAt: true,
            projectCompletedAt: true,
            // Drives the Project Manager column and its sort option.
            assignedManager: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        projectStages: {
          select: {
            id: true,
            name: true,
            status: true,
            progress: true,
            totalTasks: true,
            completedTasks: true,
          },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add approval statistics
    const proposalsWithStats = proposals.map((proposal) => {
      const pendingApprovals = proposal.services.filter(
        (s) => s.approvalStatus === 'PENDING_APPROVAL',
      ).length;

      const approvedServices = proposal.services.filter(
        (s) => s.approvalStatus === 'APPROVED',
      ).length;

      const rejectedServices = proposal.services.filter(
        (s) => s.approvalStatus === 'REJECTED',
      ).length;

      return {
        ...proposal,
        approvalStats: {
          pendingApprovals,
          approvedServices,
          rejectedServices,
          totalServices: proposal.services.length,
        },
      };
    });

    return {
      success: true,
      message: 'Successfully retrieved all proposals',
      data: proposalsWithStats,
    };
  }

  // Replace your findOne method
  async findOne(id: string, user: User) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        services: {
          orderBy: { order: 'asc' },
        },
        credits: true,
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            status: true,
            teams: { include: { members: true } },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        projectStages: {
          orderBy: { order: 'asc' },
          include: {
            assignedTo: {
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

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const isManager = this.canManage(user);
    const isOwner =
      proposal.userId === user.id || proposal.clientEmail === user.email;

    // Check team membership
    const isTeamMember = proposal.projectRequest?.teams?.some(team => 
      team.members?.some(member => member.id === user.id)
    );

    if (!isManager && !isOwner && !isTeamMember) {
      throw new ForbiddenException('Not authorized to view this proposal');
    }

    if (
      isOwner &&
      proposal.status === ProposalStatus.SENT &&
      !proposal.viewedAt
    ) {
      await this.prisma.proposal.update({
        where: { id },
        data: {
          status: ProposalStatus.VIEWED,
          viewedAt: new Date(),
        },
      });
    }

    // Calculate approval statistics
    const approvalStats = {
      pendingApprovals: proposal.services.filter(
        (s) => s.approvalStatus === 'PENDING_APPROVAL',
      ).length,
      approvedServices: proposal.services.filter(
        (s) => s.approvalStatus === 'APPROVED',
      ).length,
      rejectedServices: proposal.services.filter(
        (s) => s.approvalStatus === 'REJECTED',
      ).length,
      totalServices: proposal.services.length,
    };

    // Separate services by status
    const servicesByStatus = {
      pending: proposal.services.filter(
        (s) => s.approvalStatus === 'PENDING_APPROVAL',
      ),
      approved: proposal.services.filter(
        (s) => s.approvalStatus === 'APPROVED',
      ),
      rejected: proposal.services.filter(
        (s) => s.approvalStatus === 'REJECTED',
      ),
    };

    return {
      success: true,
      message: 'Successfully retrieved proposal',
      data: {
        ...proposal,
        approvalStats,
        servicesByStatus,
      },
    };
  }

  async getMyProposals(user: User) {
    const proposals = await this.prisma.proposal.findMany({
      where: {
        OR: [{ userId: user.id }, { clientEmail: user.email }],
        // A DRAFT lives only in the PM dashboard until it is sent, so it must
        // not surface to the client or count toward what they owe.
        status: { not: ProposalStatus.DRAFT },
      },
      include: {
        services: {
          orderBy: { order: 'asc' },
        },
        credits: true,
        projectStages: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            progress: true,
            completedTasks: true,
            totalTasks: true,
            startDate: true,
            dueDate: true,
            completedAt: true,
          },
        },
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            status: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'Successfully retrieved your proposals',
      data: proposals,
    };
  }

  async linkProposalsToUser(email: string, userId: string) {
    const updated = await this.prisma.proposal.updateMany({
      where: {
        clientEmail: email,
        userId: null, // Only update proposals without a user link
      },
      data: {
        userId: userId,
      },
    });

    this.logger.log(
      `Linked ${updated.count} proposals to user ${userId} (${email})`,
    );

    return updated.count;
  }

  // async findOne(id: string, user: User) {
  //   const proposal = await this.prisma.proposal.findUnique({
  //     where: { id },
  //     include: {
  //       services: {
  //         orderBy: { order: 'asc' },
  //       },
  //       credits: true,
  //       projectRequest: {
  //         select: {
  //           id: true,
  //           projectName: true,
  //           status: true,
  //         },
  //       },
  //       user: {
  //         select: {
  //           id: true,
  //           name: true,
  //           email: true,
  //           avatar: true,
  //         },
  //       },
  //       createdBy: {
  //         select: {
  //           id: true,
  //           name: true,
  //           email: true,
  //         },
  //       },
  //       projectStages: {
  //         orderBy: { order: 'asc' },
  //         include: {
  //           assignedTo: {
  //             select: {
  //               id: true,
  //               name: true,
  //               email: true,
  //             },
  //           },
  //         },
  //       },
  //     },
  //   });

  //   if (!proposal) {
  //     throw new NotFoundException('Proposal not found');
  //   }

  //   // Check permissions
  //   const isManager = this.canManage(user);
  //   const isOwner = proposal.userId === user.id;

  //   if (!isManager && !isOwner) {
  //     throw new ForbiddenException('Not authorized to view this proposal');
  //   }

  //   if (
  //     isOwner &&
  //     proposal.status === ProposalStatus.SENT &&
  //     !proposal.viewedAt
  //   ) {
  //     await this.prisma.proposal.update({
  //       where: { id },
  //       data: {
  //         status: ProposalStatus.VIEWED,
  //         viewedAt: new Date(),
  //       },
  //     });
  //   }

  //   return {
  //     success: true,
  //     message: 'Successfully get you single data',
  //     data: proposal,
  //   };
  // }
  // async findOne(id: string, user: User) {
  //   const proposal = await this.prisma.proposal.findUnique({
  //     where: { id },
  //     include: {
  //       services: {
  //         orderBy: { order: 'asc' },
  //       },
  //       credits: true,
  //       projectRequest: {
  //         select: {
  //           id: true,
  //           projectName: true,
  //           status: true,
  //         },
  //       },
  //       user: {
  //         select: {
  //           id: true,
  //           name: true,
  //           email: true,
  //           avatar: true,
  //         },
  //       },
  //       createdBy: {
  //         select: {
  //           id: true,
  //           name: true,
  //           email: true,
  //         },
  //       },
  //       projectStages: {
  //         orderBy: { order: 'asc' },
  //         include: {
  //           assignedTo: {
  //             select: {
  //               id: true,
  //               name: true,
  //               email: true,
  //             },
  //           },
  //         },
  //       },
  //     },
  //   });

  //   if (!proposal) {
  //     throw new NotFoundException('Proposal not found');
  //   }

  //   // Check permissions - FIXED to include email check
  //   const isManager = this.canManage(user);
  //   const isOwner =
  //     proposal.userId === user.id || proposal.clientEmail === user.email;

  //   if (!isManager && !isOwner) {
  //     throw new ForbiddenException('Not authorized to view this proposal');
  //   }

  //   // Auto-mark as viewed if client views for first time
  //   if (
  //     isOwner &&
  //     proposal.status === ProposalStatus.SENT &&
  //     !proposal.viewedAt
  //   ) {
  //     await this.prisma.proposal.update({
  //       where: { id },
  //       data: {
  //         status: ProposalStatus.VIEWED,
  //         viewedAt: new Date(),
  //       },
  //     });
  //   }

  //   return {
  //     success: true,
  //     message: 'Successfully retrieved proposal',
  //     data: proposal,
  //   };
  // }

  async update(id: string, dto: UpdateProposalDto, user: User) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const proposal = await this.prisma.proposal.findUnique({ where: { id } });
    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT proposals can be updated');
    }

    const updateData: Prisma.ProposalUpdateInput = {
      title: dto.name?.trim(),
      projectName: dto.name?.trim(),
      projectDescription: dto.description?.trim(),
      additionalContext: dto.additionalContext?.trim(),
      budgetRange: dto.budgetRange?.trim(),
      expectedTimeline: dto.expectedTimeline?.trim(),
      taxRate: dto.taxRate,
      paymentMethod: dto.paymentMethod,
      paymentTerms: dto.paymentTerms,
      notes: dto.notes?.trim(),
      termsAndConditions: dto.termsAndConditions?.trim(),
      // The Project step of the wizard re-submits these when the PM steps back
      // to it, so they have to round-trip or the edit is silently dropped.
      serviceType: dto.serviceType,
      projectCategory: dto.projectCategory,
      squareFootage: dto.squareFootage?.trim(),
    };

    const locationParts = [
      dto.streetAddress,
      dto.city,
      dto.state,
      dto.country,
    ].filter(Boolean);
    if (locationParts.length > 0) {
      updateData.projectLocation = locationParts.join(', ');
    }

    if (dto.paymentMethod) {
      updateData.paymentType = dto.paymentMethod === 'installments' || dto.paymentMethod === 'INSTALLMENT'
        ? 'INSTALLMENT'
        : 'LUMP_SUM';
    }

    const updated = await this.prisma.proposal.update({
      where: { id },
      data: updateData,
      include: {
        services: { orderBy: { order: 'asc' } },
        credits: true,
        projectRequest: true,
      },
    });

    return {
      success: true,
      message: 'Proposal updated successfully',
      data: updated,
    };
  }

  // async addService(id: string, dto: AddProposalServiceDto, user: User) {
  //   if (!this.canManage(user)) {
  //     throw new ForbiddenException('Access denied');
  //   }

  //   const proposal = await this.prisma.proposal.findUnique({
  //     where: { id },
  //     include: { services: true },
  //   });

  //   if (!proposal) {
  //     throw new NotFoundException('Proposal not found');
  //   }

  //   if (proposal.status !== ProposalStatus.DRAFT) {
  //     throw new BadRequestException(
  //       'Cannot add services to non-DRAFT proposal',
  //     );
  //   }

  //   const maxOrder = proposal.services.reduce(
  //     (max, s) => Math.max(max, s.order),
  //     -1,
  //   );

  //   const service = await this.prisma.proposalService.create({
  //     data: {
  //       proposalId: id,
  //       name: dto.name.trim(),
  //       description: dto.description?.trim(),
  //       amount: dto.cost,
  //       rate: dto.cost,
  //       quantity: 1,
  //       order: maxOrder + 1,
  //     },
  //   });

  //   // Recalculate totals
  //   await this.recalculateTotals(id);

  //   return service;
  // }
  //===================for the service add=============
  async addService(id: string, dto: AddProposalServiceDto, user: User) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: { services: true },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot add services to non-DRAFT proposal',
      );
    }

    const maxOrder = proposal.services.reduce(
      (max, s) => Math.max(max, s.order ?? 0),
      0,
    );

    const name = dto.name.trim();

    // A phase is identified by its name in the wizard, so re-adding one (double
    // click, or resuming a draft) must overwrite the existing row rather than
    // create a second line item with the same name.
    const existing = proposal.services.find(
      (s) => s.name.trim().toLowerCase() === name.toLowerCase(),
    );

    const service = existing
      ? await this.prisma.proposalService.update({
        where: { id: existing.id },
        data: {
          description: dto.description?.trim() ?? existing.description,
          amount: dto.cost,
          rate: dto.cost,
          timelineWeeks: dto.timelineWeeks ?? existing.timelineWeeks,
          order: dto.order ?? existing.order,
        },
      })
      : await this.prisma.proposalService.create({
        data: {
          proposalId: id,
          name,
          description: dto.description?.trim() ?? null,
          amount: dto.cost,
          rate: dto.cost,
          quantity: 1,
          timelineWeeks: dto.timelineWeeks ?? null,
          order: dto.order ?? maxOrder + 1,
        },
      });

    await this.recalculateTotals(id);

    return {
      success: true,
      message: existing
        ? `Service "${name}" updated successfully`
        : `Service "${name}" added successfully to proposal`,
      data: service,
    };
  }

  /**
   * Replace the display order of a proposal's services in one shot. The PM sets
   * the order in the Scope of Services step and every downstream view (review,
   * contract, project management) reads `order` ascending.
   */
  async reorderServices(
    proposalId: string,
    items: { id: string; order: number }[],
    user: User,
  ) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { services: { select: { id: true } } },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    const ownedIds = new Set(proposal.services.map((s) => s.id));
    const unknown = items.filter((i) => !ownedIds.has(i.id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        'One or more services do not belong to this proposal',
      );
    }

    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.proposalService.update({
          where: { id: item.id },
          data: { order: item.order },
        }),
      ),
    );

    return {
      success: true,
      message: 'Service order updated',
      data: await this.prisma.proposalService.findMany({
        where: { proposalId },
        orderBy: { order: 'asc' },
      }),
    };
  }

  async updateService(
    proposalId: string,
    serviceId: string,
    dto: UpdateProposalServiceDto,
    user: User,
  ) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot update services in non-DRAFT proposal',
      );
    }

    const service = await this.prisma.proposalService.findFirst({
      where: {
        id: serviceId,
        proposalId: proposalId,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found in this proposal');
    }

    // Update the service
    const updated = await this.prisma.proposalService.update({
      where: { id: serviceId },
      data: {
        name: dto.name?.trim() || service.name,
        description: dto.description?.trim() ?? service.description,
        amount: dto.cost ?? service.amount,
        rate: dto.cost ?? service.rate,
        quantity: dto.quantity ?? service.quantity,
        order: dto.order ?? service.order,
      },
    });

    // Recalculate totals
    await this.recalculateTotals(proposalId);

    // Get updated proposal
    const updatedProposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
      },
    });

    this.logger.log(
      `Service ${serviceId} updated in proposal ${proposalId} by ${user.email}`,
    );

    return {
      success: true,
      message: `Service "${updated.name}" updated successfully`,
      data: {
        service: updated,
        proposal: updatedProposal,
      },
    };
  }

  async deleteService(proposalId: string, serviceId: string, user: User) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: { services: true },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot delete services from non-DRAFT proposal',
      );
    }

    const service = await this.prisma.proposalService.findFirst({
      where: {
        id: serviceId,
        proposalId: proposalId,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found in this proposal');
    }

    // Delete the service
    await this.prisma.proposalService.delete({
      where: { id: serviceId },
    });

    // Reorder remaining services
    const remainingServices = proposal.services
      .filter((s) => s.id !== serviceId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (let i = 0; i < remainingServices.length; i++) {
      await this.prisma.proposalService.update({
        where: { id: remainingServices[i].id },
        data: { order: i + 1 },
      });
    }

    // Recalculate totals
    await this.recalculateTotals(proposalId);

    // Fetch updated proposal
    const updatedProposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        services: { orderBy: { order: 'asc' } },
      },
    });

    // Safety check (should never happen, but TypeScript requires it)
    if (!updatedProposal) {
      throw new NotFoundException(
        'Proposal disappeared after service deletion – please try again',
      );
    }

    this.logger.log(
      `Service ${serviceId} deleted from proposal ${proposalId} by ${user.email}`,
    );

    return {
      success: true,
      message: `Service "${service.name}" deleted successfully`,
      data: {
        deletedService: {
          id: service.id,
          name: service.name,
        },
        proposal: {
          id: updatedProposal.id,
          subtotal: updatedProposal.subtotal,
          taxAmount: updatedProposal.taxAmount,
          totalAmount: updatedProposal.totalAmount,
          servicesCount: updatedProposal.services.length,
          services: updatedProposal.services,
        },
      },
    };
  }

  //=====================for the service ==============

  private async recalculateTotals(proposalId: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        services: true,
        credits: true,
      },
    });

    if (!proposal) return;

    // Calculate subtotal
    const subtotal = proposal.services.reduce(
      (sum, s) => sum + Number(s.amount || 0),
      0,
    );

    // Calculate credits
    let creditsTotal = 0;
    if (proposal.credits) {
      creditsTotal = proposal.credits.reduce((sum, credit) => {
        if (credit.type === 'DOLLAR_AMOUNT') {
          return sum + Number(credit.amount);
        } else {
          return sum + (subtotal * Number(credit.amount)) / 100;
        }
      }, 0);
    }

    const afterCredits = subtotal - creditsTotal;
    const taxRate = Number(proposal.taxRate || 0);
    const taxAmount = (afterCredits * taxRate) / 100;
    const totalAmount = afterCredits + taxAmount;

    await this.prisma.proposal.update({
      where: { id: proposalId },
      data: {
        subtotal,
        taxAmount,
        totalAmount,
      },
    });
  }

  async send(
    id: string,
    user: User,
    architectSignature?: string,
    scopeNotes?: string,
  ) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        services: true,
        projectRequest: true,
        user: true,
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // DRAFT is the normal path; SENT is allowed so a proposal whose email
    // failed can be re-sent instead of being stranded. Anything the client has
    // already acted on stays locked.
    const RESENDABLE: ProposalStatus[] = [ProposalStatus.DRAFT, ProposalStatus.SENT];
    if (!RESENDABLE.includes(proposal.status)) {
      throw new BadRequestException(
        `A proposal that is ${proposal.status} can no longer be sent`,
      );
    }
    const isResend = proposal.status === ProposalStatus.SENT;

    if (proposal.services.length === 0) {
      throw new BadRequestException('Proposal must have at least one service');
    }

    // Fetch contract sections based on proposal type
    let contractSections: any[] = [];
    if (proposal.proposalType === ProposalType.AMENDMENT) {
      contractSections = await this.prisma.amendmentContract.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
      });

      // Fallback if DB is empty
      if (contractSections.length === 0) {
        contractSections = [
          {
            articleKey: 'amendment_article_1',
            title: 'Article 1 - Purpose of Amendment',
            content: `This Amendment Agreement ("Amendment") is entered into to modify the terms of the original Master Contract mentioned in the Proposal. All other terms and conditions of the Master Contract remain in full force and effect.`,
            order: 1,
          },
          {
            articleKey: 'amendment_article_2',
            title: 'Article 2 - Scope of Amended Services',
            content: 'The Architect and Owner agree to the following additional or modified services as described in this Amendment Proposal.',
            order: 2,
          }
        ];
      }
    } else {
      contractSections = await this.prisma.masterContract.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
      });

      // Basic fallback for master contract if DB is empty
      if (contractSections.length === 0) {
        contractSections = [
          {
            articleKey: 'article_1_definitions',
            title: 'Article 1 - Definitions',
            content: 'Architect refers to Architecture Simple. Work refers to architectural services. Design Documents refers to DDs. Construction Documents refers to CDs.',
            order: 1,
          },
          {
            articleKey: 'article_2_scope',
            title: 'Article 2 - Scope of Services',
            content: 'The Architect agrees to provide services for the Project as outlined in the Proposal.',
            order: 2,
          }
        ];
      }
    }

    // Update status, sent date, and attach contract sections
    await this.prisma.proposal.update({
      where: { id },
      data: {
        status: ProposalStatus.SENT,
        sentAt: new Date(),
        notes: scopeNotes ?? proposal.notes,
        contractSections: contractSections.length > 0
          ? contractSections.map((s) => ({
            articleKey: s.articleKey,
            title: s.title,
            content: s.content,
            order: s.order,
          }))
          : undefined,
        ...(architectSignature && { architectContractSignature: architectSignature }),
      },
    });

    // Update project request status to SCHEDULED (Bidding phase)
    if (proposal.projectRequestId) {
      await this.updateProjectRequestStatus(
        this.prisma,
        proposal.projectRequestId,
        RequestStatus.SCHEDULED,
      );
    }

    // Send email to client
    const frontendUrl = this.config.get(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const proposalUrl = `${frontendUrl}/proposals/${id}`;

    // Everything below is a side effect. The proposal is already marked SENT,
    // so none of it may abort the request - a mailer outage used to surface as
    // a 500 even though the send had succeeded.
    let emailSent = false;
    if (!proposal.clientEmail) {
      this.logger.warn(
        `Proposal ${proposal.proposalNumber} has no client email - skipping notification email`,
      );
    } else {
      try {
      await this.mailer.sendMail({
        to: proposal.clientEmail,
        subject: `Proposal Ready: ${proposal.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New Proposal Available</h2>
            <p>Dear ${proposal.clientName || 'Client'},</p>
            <p>Your proposal for "<strong>${proposal.projectName}</strong>" is ready for review.</p>
          
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Proposal Number:</strong> ${proposal.proposalNumber}</p>
              <p><strong>Project:</strong> ${proposal.projectName}</p>
              <p><strong>Services Included:</strong> ${proposal.services.length}</p>
              ${Number(proposal.totalAmount) > 0 ? `<p><strong>Total Amount:</strong> $${Number(proposal.totalAmount).toFixed(2)}</p>` : ''}
            </div>
          
            <p>Please review and sign the proposal by clicking the button below:</p>
          
            <div style="text-align: center; margin: 30px 0;">
              <a href="${proposalUrl}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                Review & Sign Proposal
              </a>
            </div>
          
            <p>If you have any questions, please don't hesitate to contact us.</p>
          
            <p>Best regards,<br>Your Architecture Team</p>
          </div>
        `,
        text: `Proposal for "${proposal.projectName}" is ready.\nReview & sign here: ${proposalUrl}`,
      });
        emailSent = true;
      } catch (error) {
        this.logger.error(
          `Failed to email proposal ${proposal.proposalNumber} to ${proposal.clientEmail}`,
          error as any,
        );
      }
    }

    // In-app notification alongside the email, deep-linked so one click opens
    // the contract for signing.
    if (proposal.userId && proposal.projectRequestId) {
      try {
        await this.notificationService.createNotification({
          userId: proposal.userId,
          type: 'PROPOSAL_SENT',
          title: 'Contract ready to sign',
          message: `The proposal for "${proposal.projectName}" (${proposal.proposalNumber}) is ready for your review and signature.`,
          link: clientProjectLink(proposal.projectRequestId, 'proposals', proposal.id),
          projectRequestId: proposal.projectRequestId,
        });
      } catch (error) {
        this.logger.error(
          `Failed to notify client about proposal ${proposal.proposalNumber}`,
          error as any,
        );
      }
    }

    this.logger.log(
      `Proposal ${proposal.proposalNumber} ${isResend ? 're-sent' : 'sent'} to ${proposal.clientEmail || 'no email on file'}`,
    );

    return {
      message: emailSent
        ? `Proposal ${isResend ? 're-sent' : 'sent'} to client successfully`
        : `Proposal ${isResend ? 're-sent' : 'sent'}, but the notification email could not be delivered`,
      emailSent,
      isResend,
    };
  }

  async updateProposalStatus(
    proposalId: string,
    user: User,
    newStatus: ProposalStatus,
    notes?: string,
  ) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        projectRequest: true,
        services: true,
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Permission checks
    const isManager = this.canManage(user);
    const isOwner =
      proposal.userId === user.id || proposal.clientEmail === user.email;

    if (!isManager && !isOwner) {
      throw new ForbiddenException(
        'You are not authorized to update this proposal status',
      );
    }

    if (!isManager) {
      const allowedClientStatuses: ProposalStatus[] = [
        ProposalStatus.ACCEPTED,
        ProposalStatus.REJECTED,
      ];
      if (!allowedClientStatuses.includes(newStatus)) {
        throw new BadRequestException(
          `Clients can only set status to: ${allowedClientStatuses.join(', ')}`,
        );
      }
    }

    // Validate allowed status transitions
    const allowedTransitions: Record<ProposalStatus, ProposalStatus[]> = {
      [ProposalStatus.DRAFT]: [ProposalStatus.SENT],
      [ProposalStatus.SENT]: [
        ProposalStatus.VIEWED,
        ProposalStatus.ACCEPTED,
        ProposalStatus.REJECTED,
      ],
      [ProposalStatus.VIEWED]: [
        ProposalStatus.ACCEPTED,
        ProposalStatus.REJECTED,
      ],
      [ProposalStatus.ACCEPTED]: [],
      [ProposalStatus.REJECTED]: [],
      EXPIRED: [],
    };

    const currentTransitions = allowedTransitions[proposal.status] || [];
    if (!currentTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot change status from ${proposal.status} to ${newStatus}`,
      );
    }

    // Update the proposal
    const updated = await this.prisma.proposal.update({
      where: { id: proposalId },
      data: {
        status: newStatus,
        notes: notes
          ? `${proposal.notes ? proposal.notes + '\n\n' : ''}[${new Date().toISOString()}] Status changed to ${newStatus}: ${notes}`
          : proposal.notes,
        // Set respondedAt when client accepts/rejects
        ...(newStatus === ProposalStatus.ACCEPTED ||
          newStatus === ProposalStatus.REJECTED
          ? { respondedAt: new Date() }
          : {}),
        // Set viewedAt when status changes to VIEWED
        ...(newStatus === ProposalStatus.VIEWED && !proposal.viewedAt
          ? { viewedAt: new Date() }
          : {}),
        // Set sentAt when status changes to SENT
        ...(newStatus === ProposalStatus.SENT && !proposal.sentAt
          ? { sentAt: new Date() }
          : {}),
      },
      include: {
        projectRequest: true,
        services: { orderBy: { order: 'asc' } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        projectStages: {
          orderBy: { order: 'asc' },
        },
      },
    });

    this.logger.log(
      `Proposal ${proposal.proposalNumber} status updated from ${proposal.status} to ${newStatus} by ${user.email}`,
    );

    if (newStatus === ProposalStatus.ACCEPTED) {
      await this.closeAmendmentForProposal(proposalId, user.id);
    }

    // Send notification emails based on status change
    await this.sendStatusChangeNotification(
      updated,
      proposal.status,
      newStatus,
    );

    return {
      success: true,
      message: `Proposal status updated to ${newStatus} successfully`,
      data: updated,
    };
  }

  /**
   * An amendment request stays open (UNDER_REVIEW) from the moment its
   * amendment proposal is drafted until the client accepts that proposal.
   * Once accepted there is nothing left for the PM to act on, so the request
   * is closed out — otherwise the studio's Contracts tab keeps offering
   * Accept/Reject on a request that has already run its course.
   */
  private async closeAmendmentForProposal(proposalId: string, userId: string) {
    try {
      const amendment = await this.prisma.amendmentRequest.findUnique({
        where: { amendmentProposalId: proposalId },
        select: { id: true, status: true },
      });

      if (!amendment || amendment.status === AmendmentStatus.COMPLETED) return;

      await this.prisma.amendmentRequest.update({
        where: { id: amendment.id },
        data: {
          status: AmendmentStatus.COMPLETED,
          completedAt: new Date(),
          completedBy: userId,
        },
      });

      this.logger.log(
        `Amendment ${amendment.id} marked COMPLETED — proposal ${proposalId} accepted`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to close amendment for proposal ${proposalId}: ${error}`,
      );
    }
  }

  private async sendStatusChangeNotification(
    proposal: any,
    oldStatus: ProposalStatus,
    newStatus: ProposalStatus,
  ) {
    try {
      const frontendUrl = this.config.get(
        'FRONTEND_URL',
        'http://localhost:3000',
      );

      // Notify client when proposal is sent
      if (newStatus === ProposalStatus.SENT) {
        await this.mailer.sendMail({
          to: proposal.clientEmail,
          subject: `Proposal Ready: ${proposal.projectName}`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New Proposal Available</h2>
            <p>Dear ${proposal.clientName},</p>
            <p>Your proposal for "<strong>${proposal.projectName}</strong>" is ready for review.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Proposal Number:</strong> ${proposal.proposalNumber}</p>
              <p><strong>Services:</strong> ${proposal.services.length}</p>
              ${Number(proposal.totalAmount) > 0 ? `<p><strong>Total:</strong> $${Number(proposal.totalAmount).toFixed(2)}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${frontendUrl}/proposals/${proposal.id}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                Review Proposal
              </a>
            </div>
          </div>
        `,
        });
      }

      // Notify admin when client accepts/rejects
      if (
        newStatus === ProposalStatus.ACCEPTED ||
        newStatus === ProposalStatus.REJECTED
      ) {
        const statusColor =
          newStatus === ProposalStatus.ACCEPTED ? '#10b981' : '#ef4444';
        const statusText =
          newStatus === ProposalStatus.ACCEPTED ? 'Accepted' : 'Rejected';

        // Notify team
        const team = await this.prisma.user.findMany({
          where: {
            role: { in: this.MANAGER_ROLES_ARRAY },
            isActive: true,
          },
          select: { email: true, name: true },
        });

        for (const member of team) {
          await this.mailer.sendMail({
            to: member.email,
            subject: `Proposal ${statusText}: ${proposal.projectName}`,
            html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: ${statusColor};">Proposal ${statusText}</h2>
              <p>Hello ${member.name || 'Team Member'},</p>
              <p>A proposal has been ${statusText.toLowerCase()} by the client.</p>
              
              <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Project:</strong> ${proposal.projectName}</p>
                <p><strong>Client:</strong> ${proposal.clientName}</p>
                <p><strong>Proposal:</strong> ${proposal.proposalNumber}</p>
                <p><strong>Status:</strong> ${statusText}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${frontendUrl}/admin/proposals/${proposal.id}" 
                   style="background: #2563eb; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; display: inline-block;">
                  View Proposal
                </a>
              </div>
            </div>
          `,
          });
        }

        // Confirm to client
        await this.mailer.sendMail({
          to: proposal.clientEmail,
          subject: `Proposal ${statusText}: ${proposal.projectName}`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${statusColor};">Proposal ${statusText}</h2>
            <p>Dear ${proposal.clientName},</p>
            <p>Thank you for ${statusText === 'Accepted' ? 'accepting' : 'reviewing'} our proposal for "${proposal.projectName}".</p>
            
            ${newStatus === ProposalStatus.ACCEPTED
              ? `<p>We're excited to start working with you! Our team will be in touch shortly with next steps.</p>`
              : `<p>We appreciate you taking the time to review our proposal. If you have any feedback or would like to discuss alternatives, please don't hesitate to contact us.</p>`
            }
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${frontendUrl}/dashboard/proposals/${proposal.id}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                View Your Dashboard
              </a>
            </div>
          </div>
        `,
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to send status change notification: ${error.message}`,
        );
      } else {
        this.logger.error(
          `Failed to send status change notification: ${String(error)}`,
        );
      }
    }
  }
  //=============================================delete proposal============
  /**
   * Deleting a proposal takes its services, phases and contract with it, so it
   * is gated the same way deleting a project is: SUPER_ADMIN only, and the
   * caller has to re-enter their own password.
   */
  async deleteProposal(id: string, password: string, user: User) {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only a super admin can delete a proposal');
    }

    if (!password) {
      throw new UnauthorizedException(
        'Password is required to delete a proposal',
      );
    }

    const fullUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });

    if (
      !fullUser?.password ||
      !(await bcrypt.compare(password, fullUser.password))
    ) {
      throw new UnauthorizedException('Incorrect password');
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: {
        services: true,
        credits: true,
        projectStages: true,
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Delete in transaction to ensure cascading
    await this.prisma.$transaction(async (tx) => {
      // Delete related project stages
      await tx.projectStage.deleteMany({
        where: { proposalId: id },
      });

      // Delete related credits
      await tx.proposalCredit.deleteMany({
        where: { proposalId: id },
      });

      // Delete related services
      await tx.proposalService.deleteMany({
        where: { proposalId: id },
      });

      // Delete amendment requests
      await tx.amendmentRequest.deleteMany({
        where: { proposalId: id },
      });

      // Delete the proposal itself
      await tx.proposal.delete({
        where: { id },
      });
    }, TX_OPTIONS);

    this.logger.log(
      `Proposal ${proposal.proposalNumber} deleted by ${user.email}`,
    );

    return {
      success: true,
      message: `Proposal "${proposal.proposalNumber}" deleted successfully`,
    };
  }

  //=============================================service add============

  async addServiceWithApproval(
    proposalId: string,
    dto: AddServiceWithApprovalDto,
    user: User,
  ) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        services: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Can add services to DRAFT, SENT, or VIEWED proposals
    const allowedStatuses: ProposalStatus[] = [
      ProposalStatus.DRAFT,
      ProposalStatus.SENT,
      ProposalStatus.VIEWED,
    ];

    if (!allowedStatuses.includes(proposal.status)) {
      throw new BadRequestException(
        'Cannot add services to this proposal. Status must be DRAFT, SENT, or VIEWED.',
      );
    }

    const maxOrder = proposal.services.reduce(
      (max, s) => Math.max(max, s.order ?? 0),
      0,
    );

    const costDecimal = new Prisma.Decimal(dto.cost);

    // Create service with pending approval status
    const service = await this.prisma.proposalService.create({
      data: {
        proposalId,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        amount: costDecimal,
        rate: costDecimal,
        quantity: dto.quantity || 1,
        unit: dto.unit,
        order: maxOrder + 1,
        requiresApproval: dto.requiresApproval ?? true,
        approvalStatus: ServiceApprovalStatus.PENDING_APPROVAL,
      },
    });

    this.logger.log(
      `Service "${service.name}" added to proposal ${proposal.proposalNumber} by ${user.email} - Requires approval`,
    );

    // Send email notification to client
    await this.sendServiceApprovalEmail(proposal, service, user);

    return {
      success: true,
      message: `Service "${dto.name}" added and sent to client for approval`,
      data: {
        service,
        requiresApproval: true,
        approvalStatus: 'PENDING_APPROVAL',
      },
    };
  }

  async handleServiceApproval(
    proposalId: string,
    serviceId: string,
    dto: ApproveServiceDto,
    user: User,
  ) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        services: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        projectRequest: {
          select: {
            email: true,
            userId: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }


    const isClient =
      proposal.userId === user.id ||
      proposal.clientEmail === user.email ||
      proposal.clientEmail.toLowerCase() === user.email.toLowerCase() ||
      (proposal.user && proposal.user.email.toLowerCase() === user.email.toLowerCase()) ||
      (proposal.projectRequest && proposal.projectRequest.email.toLowerCase() === user.email.toLowerCase()) ||
      (proposal.projectRequest && proposal.projectRequest.userId === user.id);

    if (!isClient && !this.canManage(user)) {
      // Add detailed logging for debugging
      this.logger.warn(
        `Service approval denied for user ${user.email}. ` +
        `Proposal userId: ${proposal.userId}, ` +
        `clientEmail: ${proposal.clientEmail}, ` +
        `user.id: ${user.id}`
      );

      throw new ForbiddenException(
        'Only the client or managers can approve/reject services',
      );
    }

    const service = await this.prisma.proposalService.findFirst({
      where: {
        id: serviceId,
        proposalId: proposalId,
      },
    });

    if (!service) {
      throw new NotFoundException('Service not found in this proposal');
    }

    if (service.approvalStatus !== ServiceApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        `Service has already been ${service.approvalStatus.toLowerCase()}`,
      );
    }

    // Validate rejection reason
    if (dto.action === 'reject' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException(
        'Rejection reason is required when rejecting a service',
      );
    }

    const isApproval = dto.action === 'approve';

    // Update service status
    const updatedService = await this.prisma.proposalService.update({
      where: { id: serviceId },
      data: {
        approvalStatus: isApproval
          ? ServiceApprovalStatus.APPROVED
          : ServiceApprovalStatus.REJECTED,
        approvedAt: isApproval ? new Date() : null,
        approvedBy: isApproval ? user.id : null,
        rejectedAt: !isApproval ? new Date() : null,
        rejectedBy: !isApproval ? user.id : null,
        rejectionReason: dto.rejectionReason?.trim() || null,
        active: isApproval,
      },
    });

    // Recalculate totals if approved
    if (isApproval) {
      await this.recalculateTotals(proposalId);
    }

    // Send confirmation emails
    await this.sendServiceApprovalConfirmation(
      proposal,
      updatedService,
      user,
      dto.action,
      dto.rejectionReason,
    );

    // Get updated proposal with totals
    const updatedProposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        proposalNumber: true,
        subtotal: true,
        taxAmount: true,
        totalAmount: true,
      },
    });

    this.logger.log(
      `Service ${serviceId} ${dto.action === 'approve' ? 'approved' : 'rejected'} by ${user.email} for proposal ${proposal.proposalNumber}`,
    );

    return {
      success: true,
      message: `Service "${service.name}" ${dto.action === 'approve' ? 'approved' : 'rejected'} successfully`,
      data: {
        service: updatedService,
        proposal: updatedProposal,
        action: dto.action,
      },
    };
  }

  async getPendingApprovals(proposalId: string, user: User) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        services: {
          where: {
            approvalStatus: ServiceApprovalStatus.PENDING_APPROVAL,
          },
          orderBy: { createdAt: 'desc' },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Check permissions
    const isManager = this.canManage(user);
    const isClient =
      proposal.userId === user.id || proposal.clientEmail === user.email;

    if (!isManager && !isClient) {
      throw new ForbiddenException('Not authorized to view this proposal');
    }

    return {
      success: true,
      message: 'Successfully retrieved pending approvals',
      data: {
        proposalId: proposal.id,
        proposalNumber: proposal.proposalNumber,
        pendingCount: proposal.services.length,
        pendingServices: proposal.services,
      },
    };
  }

  /**
   * Send email to client for service approval
   */
  private async sendServiceApprovalEmail(
    proposal: any,
    service: any,
    addedBy: User,
  ) {
    try {
      const frontendUrl = this.config.get(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      const approvalUrl = `${frontendUrl}/proposals/${proposal.id}/approve-service/${service.id}`;

      await this.mailer.sendMail({
        to: proposal.clientEmail,
        subject: `New Service Added - Approval Required: ${proposal.projectName}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">⏳ Service Approval Required</h2>
          <p>Dear ${proposal.clientName},</p>
          <p>A new service has been added to your proposal and requires your approval.</p>
          
          <div style="background: #fffbeb; padding: 20px; border-left: 4px solid #f59e0b; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #92400e;">New Service Details</h3>
            <p style="margin: 5px 0;"><strong>Service Name:</strong> ${service.name}</p>
            ${service.description ? `<p style="margin: 5px 0;"><strong>Description:</strong> ${service.description}</p>` : ''}
            <p style="margin: 5px 0;"><strong>Amount:</strong> $${Number(service.amount).toFixed(2)}</p>
            <p style="margin: 5px 0;"><strong>Added By:</strong> ${addedBy.name || addedBy.email}</p>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Proposal:</strong> ${proposal.proposalNumber}</p>
            <p style="margin: 5px 0;"><strong>Project:</strong> ${proposal.projectName}</p>
          </div>
          
          <p><strong>Please review and take action on this service:</strong></p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${approvalUrl}" 
               style="background: #10b981; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">
              Review Service
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            <strong>Note:</strong> This service will not be included in your proposal total until you approve it.
          </p>
          
          <p>If you have any questions about this service, please contact us.</p>
          
          <p>Best regards,<br>Your Architecture Team</p>
        </div>
      `,
        text: `New service "${service.name}" added to proposal ${proposal.proposalNumber}.\nAmount: $${Number(service.amount).toFixed(2)}\nReview and approve: ${approvalUrl}`,
      });

      this.logger.log(
        `Service approval email sent to ${proposal.clientEmail} for service ${service.id}`,
      );
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to send service approval email: ${error.message}`,
        );
      } else {
        this.logger.error(
          `Failed to send ervice approval email: ${String(error)}`,
        );
      }
    }
  }

  /**
   * Send confirmation email after approval/rejection
   */
  private async sendServiceApprovalConfirmation(
    proposal: any,
    service: any,
    user: User,
    action: 'approve' | 'reject',
    rejectionReason?: string,
  ) {
    try {
      const frontendUrl = this.config.get(
        'FRONTEND_URL',
        'http://localhost:3000',
      );
      const isApproval = action === 'approve';
      const statusColor = isApproval ? '#10b981' : '#ef4444';
      const statusText = isApproval ? 'Approved' : 'Rejected';
      const icon = isApproval ? '✅' : '❌';

      // Email to client (confirmation)
      await this.mailer.sendMail({
        to: proposal.clientEmail,
        subject: `Service ${statusText}: ${service.name}`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${statusColor};">${icon} Service ${statusText}</h2>
          <p>Dear ${proposal.clientName},</p>
          <p>Thank you for your response. The service has been ${statusText.toLowerCase()}.</p>
          
          <div style="background: ${isApproval ? '#f0fdf4' : '#fef2f2'}; padding: 20px; 
                      border-left: 4px solid ${statusColor}; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0;">Service Details</h3>
            <p style="margin: 5px 0;"><strong>Service:</strong> ${service.name}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> $${Number(service.amount).toFixed(2)}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> ${statusText}</p>
            ${rejectionReason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
          </div>

          ${isApproval
            ? `<p>This service has been added to your proposal total.</p>`
            : `<p>This service will not be included in your proposal. Our team will reach out to discuss alternatives.</p>`
          }
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${frontendUrl}/proposals/${proposal.id}" 
               style="background: #2563eb; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              View Proposal
            </a>
          </div>
          
          <p>Best regards,<br>Your Architecture Team</p>
        </div>
      `,
        text: `Service "${service.name}" ${statusText.toLowerCase()}.\nView proposal: ${frontendUrl}/proposals/${proposal.id}`,
      });

      // Email to admin team
      const team = await this.prisma.user.findMany({
        where: {
          role: { in: this.MANAGER_ROLES_ARRAY },
          isActive: true,
        },
        select: { email: true, name: true },
      });

      for (const member of team) {
        await this.mailer.sendMail({
          to: member.email,
          subject: `Service ${statusText} by Client: ${proposal.projectName}`,
          html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${statusColor};">Service ${statusText}</h2>
            <p>Hello ${member.name || 'Team Member'},</p>
            <p>A client has ${statusText.toLowerCase()} a service on their proposal.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Client:</strong> ${proposal.clientName}</p>
              <p><strong>Proposal:</strong> ${proposal.proposalNumber}</p>
              <p><strong>Service:</strong> ${service.name}</p>
              <p><strong>Amount:</strong> $${Number(service.amount).toFixed(2)}</p>
              <p><strong>Status:</strong> ${statusText}</p>
              ${rejectionReason ? `<p><strong>Rejection Reason:</strong> ${rejectionReason}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${frontendUrl}/admin/proposals/${proposal.id}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                View Proposal
              </a>
            </div>
          </div>
        `,
          text: `Service ${statusText}: ${service.name}\nClient: ${proposal.clientName}\nProposal: ${proposal.proposalNumber}${rejectionReason ? `\nReason: ${rejectionReason}` : ''}`,
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(
          `Failed to send approval confirmation emails: ${error.message}`,
        );
      } else {
        this.logger.error(
          `Failed to send approval confirmation emails: ${String(error)}`,
        );
      }
    }
  }

  // Helper method to update project request status
  private async updateProjectRequestStatus(
    prisma: any,
    id: string,
    status: RequestStatus,
  ) {
    try {
      await prisma.projectRequest.update({
        where: { id },
        data: { status, updatedAt: new Date() },
      });
      this.logger.log(`Project request ${id} status updated to ${status}`);
    } catch (error) {
      this.logger.error(
        `Failed to update project request ${id} status to ${status}`,
        error,
      );
    }
  }
}
