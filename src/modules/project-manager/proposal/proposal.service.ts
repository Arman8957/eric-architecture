import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  User,
  ProposalStatus,
  ProjectStatus,
  StageStatus,
  RequestStatus,
  UserRole,
  Prisma,
  ProjectCategory,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailerService } from 'src/utils/email/email.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { AddProposalServiceDto } from './dto/add-proposal-service.dto';
import { ProposalSignatureDto } from './dto/proposal-signature.dto';
import { success } from 'zod';
import { UpdateProposalServiceDto } from './dto/update-proposal-status.dto';

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
  ) {}

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

    const year = new Date().getFullYear();
    const count = await this.prisma.proposal.count({
      where: { proposalNumber: { startsWith: `PROP-${year}-` } },
    });
    const proposalNumber = `PROP-${year}-${String(count + 1).padStart(4, '0')}`;

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

  // async create(dto: CreateProposalDto, user: User) {
  //   // Verify user has permission
  //   if (!this.canManage(user)) {
  //     throw new ForbiddenException('Only managers can create proposals');
  //   }

  //   const projectRequest = await this.prisma.projectRequest.findUnique({
  //     where: { id: dto.projectRequestId },
  //     include: { user: true },
  //   });

  //   if (!projectRequest) {
  //     throw new NotFoundException('Project request not found');
  //   }

  //   const clientUserId = projectRequest.userId;
  //   if (!clientUserId) {
  //     throw new BadRequestException(
  //       'Cannot create proposal: no registered client user linked to request',
  //     );
  //   }

  //   // Generate unique proposal number
  //   const year = new Date().getFullYear();
  //   const count = await this.prisma.proposal.count({
  //     where: { proposalNumber: { startsWith: `PROP-${year}-` } },
  //   });
  //   const proposalNumber = `PROP-${year}-${String(count + 1).padStart(4, '0')}`;

  //   // Build location string
  //   const locationParts = [
  //     dto.streetAddress,
  //     dto.city,
  //     dto.state,
  //     dto.country,
  //   ].filter(Boolean);
  //   const projectLocation = locationParts.join(', ') || '';

  //   // Create proposal
  //   const data: Prisma.ProposalCreateInput = {
  //     projectRequest: { connect: { id: dto.projectRequestId } },
  //     proposalNumber,
  //     user: { connect: { id: clientUserId } },
  //     title: dto.name.trim(),
  //     projectName: dto.name.trim(),
  //     projectDescription: dto.description?.trim(),
  //     additionalContext: dto.additionalContext?.trim(),
  //     projectLocation,
  //     serviceType: dto.serviceType,
  //     projectCategory: dto.projectCategory,
  //     squareFootage: dto.squareFootage?.trim(),
  //     budgetRange: dto.budgetRange?.trim(),
  //     expectedTimeline: dto.expectedTimeline?.trim(),
  //     clientName:
  //       `${projectRequest.clientFirstName} ${projectRequest.clientLastName || ''}`.trim(),
  //     clientEmail: projectRequest.email,
  //     clientPhone: projectRequest.phone,
  //     clientCompany: projectRequest.companyName,
  //     createdBy: { connect: { id: user.id } },
  //     status: ProposalStatus.DRAFT,
  //   };

  //   const proposal = await this.prisma.proposal.create({
  //     data,
  //     include: {
  //       services: true,
  //       projectRequest: true,
  //       user: {
  //         select: {
  //           id: true,
  //           name: true,
  //           email: true,
  //         },
  //       },
  //     },
  //   });

  //   this.logger.log(
  //     `Proposal created: ${proposal.id} (${proposal.proposalNumber}) by ${user.email}`,
  //   );

  //   return proposal;
  // }

  // async findAll(user: User) {
  //   if (!this.canManage(user)) {
  //     throw new ForbiddenException('Access denied');
  //   }

  //   return this.prisma.proposal.findMany({
  //     include: {
  //       services: {
  //         orderBy: { order: 'asc' },
  //       },
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
  //         },
  //       },
  //       projectStages: {
  //         select: {
  //           id: true,
  //           name: true,
  //           status: true,
  //           progress: true,
  //         },
  //       },
  //     },
  //     orderBy: { createdAt: 'desc' },
  //   });
  // }

  // Key changes needed in your proposal.service.ts

  // 1. Update the sign() method to create ProjectStages correctly

  // async create(dto: CreateProposalDto, user: User) {
  //   if (!this.canManage(user)) {
  //     throw new ForbiddenException('Only managers can create proposals');
  //   }

  //   const projectRequest = await this.prisma.projectRequest.findUnique({
  //     where: { id: dto.projectRequestId },
  //   });

  //   if (!projectRequest) {
  //     throw new NotFoundException('Project request not found');
  //   }

  //   const clientUserId = projectRequest.userId ?? undefined;
  //   const year = new Date().getFullYear();
  //   const count = await this.prisma.proposal.count({
  //     where: { proposalNumber: { startsWith: `PROP-${year}-` } },
  //   });
  //   const proposalNumber = `PROP-${year}-${String(count + 1).padStart(4, '0')}`;
  //   const locationParts = [
  //     dto.streetAddress,
  //     dto.city,
  //     dto.state,
  //     dto.country,
  //   ].filter(Boolean);
  //   const projectLocation = locationParts.join(', ') || '';

  //   const data: Prisma.ProposalCreateInput = {
  //     projectRequest: { connect: { id: dto.projectRequestId } },

  //     ...(clientUserId && { user: { connect: { id: clientUserId } } }),

  //     // Proposal metadata
  //     proposalNumber,
  //     title: dto.name.trim(),
  //     projectName: dto.name.trim(),
  //     projectDescription: dto.description?.trim(),
  //     additionalContext: dto.additionalContext?.trim(),
  //     projectLocation,

  //     // Project specs
  //     serviceType: dto.serviceType,
  //     projectCategory: dto.projectCategory,
  //     squareFootage: dto.squareFootage?.trim(),
  //     budgetRange: dto.budgetRange?.trim(),
  //     expectedTimeline: dto.expectedTimeline?.trim(),

  //     // Client contact info (always filled from ProjectRequest)
  //     clientName:
  //       `${projectRequest.clientFirstName} ${projectRequest.clientLastName || ''}`.trim(),
  //     clientEmail: projectRequest.email,
  //     clientPhone: projectRequest.phone ?? undefined,
  //     clientCompany: projectRequest.companyName ?? undefined,

  //     // Financials (from DTO where applicable)
  //     taxRate: dto.taxRate ?? undefined,

  //     // Payment & terms
  //     paymentMethod: dto.paymentMethod,
  //     paymentTerms: dto.paymentTerms,

  //     // Additional
  //     notes: dto.notes?.trim(),
  //     termsAndConditions: dto.termsAndConditions?.trim(),
  //     expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,

  //     // Audit trail
  //     createdBy: { connect: { id: user.id } },

  //     // Initial status
  //     // status: ProposalStatus.DRAFT,
  //   };

  //   // 7. Create the proposal with useful relations
  //   const proposal = await this.prisma.proposal.create({
  //     data,
  //     include: {
  //       services: true,
  //       credits: true,
  //       projectRequest: {
  //         select: {
  //           id: true,
  //           projectName: true,
  //           status: true,
  //           clientFirstName: true,
  //           clientLastName: true,
  //           email: true,
  //           phone: true,
  //           companyName: true,
  //         },
  //       },
  //       user: clientUserId
  //         ? {
  //             select: {
  //               id: true,
  //               name: true,
  //               email: true,
  //             },
  //           }
  //         : undefined,
  //       createdBy: {
  //         select: {
  //           id: true,
  //           name: true,
  //           email: true,
  //           role: true,
  //         },
  //       },
  //     },
  //   });

  //   this.logger.log(
  //     `Proposal created: ${proposal.id} (${proposal.proposalNumber}) by ${user.email} ` +
  //       `(for request ${dto.projectRequestId}, client: ${proposal.clientName})`,
  //   );

  //   return {
  //     success: true,
  //     message: `Project request status updated to successfully`,
  //     data: proposal,
  //   };
  // }

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

    return this.prisma.$transaction(async (tx) => {
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
      if (
        updatedProposal.ownerSignature &&
        updatedProposal.architectSignature
      ) {
        // Mark proposal as accepted
        await tx.proposal.update({
          where: { id },
          data: {
            status: ProposalStatus.ACCEPTED,
            respondedAt: new Date(),
          },
        });

        let order = 0;
        for (const service of updatedProposal.services) {
          await tx.projectStage.create({
            data: {
              proposalId: updatedProposal.id,
              name: service.name,
              description: service.description || `Service: ${service.name}`,
              status: StageStatus.NOT_STARTED,
              order: order++,
              totalTasks: 5, // Default task count, can be updated later
              completedTasks: 0,
              progress: 0,
            },
          });
        }

        // Update project request to ACTIVE status (not COMPLETED)
        if (updatedProposal.projectRequestId) {
          await tx.projectRequest.update({
            where: { id: updatedProposal.projectRequestId },
            data: { status: RequestStatus.SCHEDULED }, // Keep as SCHEDULED since it's now active
          });
        }

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
        const team = await tx.user.findMany({
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

        this.logger.log(
          `Proposal ${updatedProposal.proposalNumber} fully signed and accepted. Stages created.`,
        );
      }

      return updatedProposal;
    });
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

    if (!isManager && !isOwner) {
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

  async findAll(user: User) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.proposal.findMany({
      include: {
        services: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            amount: true,
            order: true,
          },
        },
        projectRequest: {
          select: {
            id: true,
            projectName: true,
            status: true,
            clientFirstName: true,
            clientLastName: true,
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
  }

  async getMyProposals(user: User) {
    const proposals = await this.prisma.proposal.findMany({
      where: {
        OR: [{ userId: user.id }, { clientEmail: user.email }],
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

    // Check permissions - FIXED to include email check
    const isManager = this.canManage(user);
    const isOwner =
      proposal.userId === user.id || proposal.clientEmail === user.email;

    if (!isManager && !isOwner) {
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
    }

    return {
      success: true,
      message: 'Successfully retrieved proposal',
      data: proposal,
    };
  }

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

    return this.prisma.proposal.update({
      where: { id },
      data: {
        title: dto.name?.trim(),
        projectName: dto.name?.trim(),
        projectDescription: dto.description?.trim(),
        additionalContext: dto.additionalContext?.trim(),
        budgetRange: dto.budgetRange?.trim(),
        expectedTimeline: dto.expectedTimeline?.trim(),
      },
      include: {
        services: true,
        projectRequest: true,
      },
    });
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

    const service = await this.prisma.proposalService.create({
      data: {
        proposalId: id,
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        amount: dto.cost,
        rate: dto.cost,
        quantity: 1,
        order: maxOrder + 1,
      },
    });

    await this.recalculateTotals(id);

    return {
      success: true,
      message: `Service "${dto.name}" added successfully to proposal`,
      data: service,
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

async deleteService(
  proposalId: string,
  serviceId: string,
  user: User,
) {
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
    throw new BadRequestException('Cannot delete services from non-DRAFT proposal');
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
      'Proposal disappeared after service deletion – please try again'
    );
  }

  this.logger.log(
    `Service ${serviceId} deleted from proposal ${proposalId} by ${user.email}`
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

  async send(id: string, user: User) {
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

    if (proposal.status !== ProposalStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT proposals can be sent');
    }

    if (proposal.services.length === 0) {
      throw new BadRequestException('Proposal must have at least one service');
    }

    // Update status and sent date
    await this.prisma.proposal.update({
      where: { id },
      data: {
        status: ProposalStatus.SENT,
        sentAt: new Date(),
      },
    });

    // Send email to client
    const frontendUrl = this.config.get(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const proposalUrl = `${frontendUrl}/proposals/${id}`;

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

    // Fix 4: Use parentheses, not backticks
    this.logger.log(
      `Proposal ${proposal.proposalNumber} sent to ${proposal.clientEmail}`,
    );

    return { message: 'Proposal sent to client successfully' };
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
    const allowedClientStatuses: ProposalStatus[] = [ // FIX: Type the array explicitly
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
    EXPIRED: []
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

  // Send notification emails based on status change
  await this.sendStatusChangeNotification(updated, proposal.status, newStatus);

  return {
    success: true,
    message: `Proposal status updated to ${newStatus} successfully`,
    data: updated,
  };
}

// Add this helper method for sending notifications
private async sendStatusChangeNotification(
  proposal: any,
  oldStatus: ProposalStatus,
  newStatus: ProposalStatus,
) {
  try {
    const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');

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
    if (newStatus === ProposalStatus.ACCEPTED || newStatus === ProposalStatus.REJECTED) {
      const statusColor = newStatus === ProposalStatus.ACCEPTED ? '#10b981' : '#ef4444';
      const statusText = newStatus === ProposalStatus.ACCEPTED ? 'Accepted' : 'Rejected';

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
            
            ${
              newStatus === ProposalStatus.ACCEPTED
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
    this.logger.error(`Failed to send status change notification: ${error.message}`);
    // Don't throw - email failure shouldn't block the status update
  }
}

  // async sign(id: string, dto: ProposalSignatureDto, user: User) {
  //   const proposal = await this.prisma.proposal.findUnique({
  //     where: { id },
  //     include: {
  //       projectRequest: true,
  //       services: true,
  //       user: true,
  //     },
  //   });

  //   if (!proposal) {
  //     throw new NotFoundException('Proposal not found');
  //   }

  //   // Fix 2: Use Set.has() instead of array.includes()
  //   if (!this.ALLOWED_SIGN_STATUSES.has(proposal.status)) {
  //     throw new BadRequestException('Proposal must be SENT or VIEWED to sign');
  //   }

  //   let updateData: Prisma.ProposalUpdateInput = {};

  //   if (dto.type === 'owner') {
  //     // Client signature
  //     if (user.id !== proposal.userId) {
  //       throw new ForbiddenException('Not authorized as owner');
  //     }
  //     updateData = {
  //       ownerSignature: dto.signature,
  //       ownerSignedAt: new Date(),
  //       ownerSignedBy: proposal.clientName,
  //     };
  //   } else if (dto.type === 'architect') {
  //     // Manager signature
  //     if (!this.canManage(user)) {
  //       throw new ForbiddenException('Not authorized as architect');
  //     }
  //     updateData = {
  //       architectSignature: dto.signature,
  //       architectSignedAt: new Date(),
  //       architectSignedBy: user.name || user.email,
  //     };
  //   } else {
  //     throw new BadRequestException('Invalid signature type');
  //   }

  //   // Use transaction to handle all updates atomically
  //   return this.prisma.$transaction(async (tx) => {
  //     // Update proposal with signature
  //     const updatedProposal = await tx.proposal.update({
  //       where: { id },
  //       data: updateData,
  //       include: {
  //         services: { orderBy: { order: 'asc' } },
  //         projectRequest: true,
  //         user: true,
  //       },
  //     });

  //     // Check if both signatures are present
  //     if (updatedProposal.ownerSignature && updatedProposal.architectSignature) {
  //       // Mark proposal as accepted
  //       await tx.proposal.update({
  //         where: { id },
  //         data: {
  //           status: ProposalStatus.ACCEPTED,
  //           respondedAt: new Date(),
  //         },
  //       });

  //       const slug = updatedProposal.projectName
  //         .toLowerCase()
  //         .replace(/\s+/g, '-')
  //         .replace(/[^a-z0-9-]/g, '');
  //       const uniqueSlug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  //       const newProject = await tx.project.create({
  //         data: {
  //           title: updatedProposal.projectName,
  //           slug: uniqueSlug,
  //           description: updatedProposal.projectDescription || '',
  //           category: updatedProposal.projectCategory || ProjectCategory.RESIDENTIAL,
  //           status: ProjectStatus.PUBLISHED,
  //           location: updatedProposal.projectLocation || '',
  //           clientName: updatedProposal.clientName || '',
  //           authorId: updatedProposal.createdById,
  //           proposalId: updatedProposal.id,
  //         },
  //       });

  //       let order = 1;
  //       for (const service of updatedProposal.services) {
  //         await tx.projectStage.create({
  //           data: {
  //             projectId: newProject.id,
  //             proposalId: updatedProposal.id,
  //             name: service.name,
  //             description: service.description || `Service: ${service.name}`,
  //             status: StageStatus.NOT_STARTED,
  //             order: order++,
  //             totalTasks: 0,
  //             completedTasks: 0,
  //           },
  //         });
  //       }

  //       if (updatedProposal.projectRequestId) {
  //         await tx.projectRequest.update({
  //           where: { id: updatedProposal.projectRequestId },
  //           data: { status: RequestStatus.COMPLETED },
  //         });
  //       }

  //       // Send notifications
  //       const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');

  //       // Notify client
  //       await this.mailer.sendMail({
  //         to: updatedProposal.clientEmail,
  //         subject: `Project Activated: ${updatedProposal.projectName}`,
  //         html: `
  //           <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  //             <h2 style="color: #10b981;">🎉 Congratulations!</h2>
  //             <p>Dear ${updatedProposal.clientName},</p>
  //             <p>Your proposal has been fully signed and your project is now active!</p>

  //             <div style="background: #f0fdf4; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0;">
  //               <h3 style="margin: 0 0 10px 0;">Project Details</h3>
  //               <p style="margin: 5px 0;"><strong>Project:</strong> ${updatedProposal.projectName}</p>
  //               <p style="margin: 5px 0;"><strong>Proposal:</strong> ${updatedProposal.proposalNumber}</p>
  //               <p style="margin: 5px 0;"><strong>Stages:</strong> ${updatedProposal.services.length}</p>
  //             </div>

  //             <p>You can now track your project progress in your dashboard.</p>

  //             <div style="text-align: center; margin: 30px 0;">
  //               <a href="${frontendUrl}/dashboard/projects/${newProject.id}"
  //                  style="background: #2563eb; color: white; padding: 12px 24px;
  //                         text-decoration: none; border-radius: 6px; display: inline-block;">
  //                 View Project Dashboard
  //               </a>
  //             </div>

  //             <p>We're excited to work with you!</p>
  //             <p>Best regards,<br>Your Architecture Team</p>
  //           </div>
  //         `,
  //         text: `Project "${updatedProposal.projectName}" is now active!\nView your dashboard: ${frontendUrl}/dashboard/projects/${newProject.id}`,
  //       });

  //       // Notify internal team
  //       //  Use MANAGER_ROLES_ARRAY instead of direct array
  //       const team = await tx.user.findMany({
  //         where: {
  //           role: { in: this.MANAGER_ROLES_ARRAY },
  //           isActive: true,
  //         },
  //         select: { email: true, name: true },
  //       });

  //       for (const member of team) {
  //         await this.mailer.sendMail({
  //           to: member.email,
  //           subject: `New Project Created: ${updatedProposal.projectName}`,
  //           html: `
  //             <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  //               <h2 style="color: #2563eb;">New Project Activated</h2>
  //               <p>Hello ${member.name || 'Team Member'},</p>
  //               <p>A proposal has been fully signed and a new project has been created.</p>

  //               <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
  //                 <p><strong>Project:</strong> ${updatedProposal.projectName}</p>
  //                 <p><strong>Client:</strong> ${updatedProposal.clientName}</p>
  //                 <p><strong>Proposal:</strong> ${updatedProposal.proposalNumber}</p>
  //                 <p><strong>Stages:</strong> ${updatedProposal.services.length}</p>
  //               </div>

  //               <div style="text-align: center; margin: 30px 0;">
  //                 <a href="${frontendUrl}/admin/projects/${newProject.id}"
  //                    style="background: #2563eb; color: white; padding: 12px 24px;
  //                           text-decoration: none; border-radius: 6px; display: inline-block;">
  //                   View Project
  //                 </a>
  //               </div>
  //             </div>
  //           `,
  //           text: `New project: ${updatedProposal.projectName}\nClient: ${updatedProposal.clientName}\nView: ${frontendUrl}/admin/projects/${newProject.id}`,
  //         });
  //       }

  //       this.logger.log(
  //         `Project created from proposal ${updatedProposal.proposalNumber}: ${newProject.id}`,
  //       );
  //     }

  //     return updatedProposal;
  //   });
  // }

  // async getMyProposals(user: User) {
  //   return this.prisma.proposal.findMany({
  //     where: { userId: user.id },
  //     include: {
  //       services: { orderBy: { order: 'asc' } },
  //       projectStages: {
  //         orderBy: { order: 'asc' },
  //         select: {
  //           id: true,
  //           name: true,
  //           status: true,
  //           progress: true,
  //           completedTasks: true,
  //           totalTasks: true,
  //         },
  //       },
  //       projectRequest: {
  //         select: {
  //           id: true,
  //           projectName: true,
  //         },
  //       },
  //     },
  //     orderBy: { createdAt: 'desc' },
  //   });
  // }
}
