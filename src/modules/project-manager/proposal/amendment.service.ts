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
  AmendmentStatus,
  ProposalType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailerService } from 'src/utils/email/email.service';
import {
  CreateAmendmentRequestDto,
  ReviewAmendmentDto,
  CreateAmendmentProposalDto,
} from './dto/amendment.dto';

@Injectable()
export class AmendmentService {
  private readonly logger = new Logger(AmendmentService.name);
  private readonly MANAGER_ROLES_ARRAY = [
    'SUPER_ADMIN',
    'ADMIN',
    'PROJECT_MANAGER',
  ];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private mailer: MailerService,
  ) {}

  private canManage(user: User): boolean {
    return this.MANAGER_ROLES_ARRAY.includes(user.role);
  }

  /**
   * Client creates amendment request
   */
async createAmendmentRequest(
  proposalId: string,
  dto: CreateAmendmentRequestDto,
  user: User,
) {
  // Verify proposal exists
  const proposal = await this.prisma.proposal.findUnique({
    where: { id: proposalId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
      projectRequest: {
        select: {
          email: true,
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
    (proposal.projectRequest && proposal.projectRequest.email.toLowerCase() === user.email.toLowerCase());

  if (!isClient && !this.canManage(user)) {
    // Add detailed logging for debugging
    this.logger.warn(
      `Amendment request denied for user ${user.email}. ` +
      `Proposal userId: ${proposal.userId}, ` +
      `clientEmail: ${proposal.clientEmail}, ` +
      `user.id: ${user.id}`
    );
    
    throw new ForbiddenException(
      'Only the client can create amendment requests',
    );
  }

  // Proposal must be accepted to create amendments
  if (proposal.status !== ProposalStatus.ACCEPTED) {
    throw new BadRequestException(
      'Can only create amendment requests for accepted proposals',
    );
  }


  const amendment = await this.prisma.amendmentRequest.create({
    data: {
      proposalId,
      projectName: dto.projectName.trim(),
      description: dto.description.trim(),
      services: dto.services.trim(),
      urgency: dto.urgency,
      requestedById: user.id,
      status: AmendmentStatus.PENDING,
    },
    include: {
      proposal: {
        select: {
          id: true,
          proposalNumber: true,
          projectName: true,
          clientName: true,
          clientEmail: true,
        },
      },
      requestedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  this.logger.log(
    `Amendment request created: ${amendment.id} for proposal ${proposal.proposalNumber} by ${user.email}`,
  );

  await this.notifyManagersNewAmendment(amendment);

  return {
    success: true,
    message: 'Amendment request submitted successfully',
    data: amendment,
  };
}

  /**
   * Get amendment requests for a proposal
   */
  async getAmendmentRequests(
    proposalId: string,
    user: User,
    status?: string,
  ) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Check permissions
    const isManager = this.canManage(user);
    const isClient =
      proposal.userId === user.id || proposal.clientEmail === user.email;

    if (!isManager && !isClient) {
      throw new ForbiddenException('Not authorized');
    }

    const where: Prisma.AmendmentRequestWhereInput = {
      proposalId,
    };

    if (status) {
      where.status = status as AmendmentStatus;
    }

    const amendments = await this.prisma.amendmentRequest.findMany({
      where,
      include: {
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        amendmentProposal: {
          select: {
            id: true,
            proposalNumber: true,
            status: true,
            totalAmount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'Successfully retrieved amendment requests',
      data: amendments,
    };
  }

  /**
   * Get single amendment request
   */
  async getAmendmentRequest(
    proposalId: string,
    amendmentId: string,
    user: User,
  ) {
    const amendment = await this.prisma.amendmentRequest.findFirst({
      where: {
        id: amendmentId,
        proposalId,
      },
      include: {
        proposal: true,
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        amendmentProposal: {
          include: {
            services: true,
          },
        },
      },
    });

    if (!amendment) {
      throw new NotFoundException('Amendment request not found');
    }

    // Check permissions
    const isManager = this.canManage(user);
    const isClient =
      amendment.proposal.userId === user.id ||
      amendment.proposal.clientEmail === user.email;

    if (!isManager && !isClient) {
      throw new ForbiddenException('Not authorized');
    }

    return {
      success: true,
      message: 'Successfully retrieved amendment request',
      data: amendment,
    };
  }

  /**
   * PM reviews amendment request
   */
  async reviewAmendmentRequest(
    amendmentId: string,
    dto: ReviewAmendmentDto,
    user: User,
  ) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const amendment = await this.prisma.amendmentRequest.findUnique({
      where: { id: amendmentId },
      include: {
        proposal: true,
        requestedBy: true,
      },
    });

    if (!amendment) {
      throw new NotFoundException('Amendment request not found');
    }

    if (amendment.status !== AmendmentStatus.PENDING) {
      throw new BadRequestException('Amendment has already been reviewed');
    }

    const newStatus =
      dto.action === 'APPROVED'
        ? AmendmentStatus.APPROVED
        : AmendmentStatus.REJECTED;

    const updated = await this.prisma.amendmentRequest.update({
      where: { id: amendmentId },
      data: {
        status: newStatus,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
      },
      include: {
        proposal: true,
        requestedBy: true,
        reviewedBy: true,
      },
    });

    this.logger.log(
      `Amendment ${amendmentId} ${dto.action.toLowerCase()} by ${user.email}`,
    );

    // Send notification to client
    await this.notifyClientReviewDecision(updated, dto.action);

    return {
      success: true,
      message: `Amendment request ${dto.action.toLowerCase()} successfully`,
      data: updated,
    };
  }

  /**
   * PM creates proposal from amendment
   */
  async createProposalFromAmendment(
    amendmentId: string,
    dto: CreateAmendmentProposalDto,
    user: User,
  ) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const amendment = await this.prisma.amendmentRequest.findUnique({
      where: { id: amendmentId },
      include: {
        proposal: {
          include: {
            projectRequest: true,
          },
        },
      },
    });

    if (!amendment) {
      throw new NotFoundException('Amendment request not found');
    }

    if (amendment.status !== AmendmentStatus.APPROVED) {
      throw new BadRequestException(
        'Can only create proposals from approved amendments',
      );
    }

    if (amendment.amendmentProposalId) {
      throw new BadRequestException(
        'Proposal already created for this amendment',
      );
    }

    const parentProposal = amendment.proposal;

    // Generate proposal number
    const year = new Date().getFullYear();
    const count = await this.prisma.proposal.count({
      where: { proposalNumber: { startsWith: `PROP-${year}-` } },
    });
    const proposalNumber = `PROP-${year}-${String(count + 1).padStart(4, '0')}-AMD`;

    // Create amendment proposal
    const amendmentProposal = await this.prisma.proposal.create({
      data: {
        projectRequestId: parentProposal.projectRequestId,
        userId: parentProposal.userId,
        proposalNumber,
        proposalType: ProposalType.AMENDMENT,
        parentProposalId: parentProposal.id,
        title: dto.name.trim(),
        projectName: dto.name.trim(),
        projectDescription: dto.description?.trim(),
        additionalContext: dto.additionalContext?.trim(),
        projectLocation: parentProposal.projectLocation,
        serviceType: parentProposal.serviceType,
        projectCategory: parentProposal.projectCategory,
        squareFootage: parentProposal.squareFootage,
        budgetRange: dto.budgetRange?.trim(),
        expectedTimeline: dto.expectedTimeline?.trim(),
        clientName: parentProposal.clientName,
        clientEmail: parentProposal.clientEmail,
        clientPhone: parentProposal.clientPhone,
        clientCompany: parentProposal.clientCompany,
        taxRate: dto.taxRate ? new Prisma.Decimal(dto.taxRate) : parentProposal.taxRate,
        paymentMethod: dto.paymentMethod,
        paymentTerms: dto.paymentTerms,
        notes: dto.notes?.trim(),
        termsAndConditions: dto.termsAndConditions?.trim(),
        createdById: user.id,
        status: ProposalStatus.DRAFT,
      },
      include: {
        parentProposal: {
          select: {
            id: true,
            proposalNumber: true,
            projectName: true,
          },
        },
      },
    });

    // Link amendment to proposal
    await this.prisma.amendmentRequest.update({
      where: { id: amendmentId },
      data: {
        amendmentProposalId: amendmentProposal.id,
        status: AmendmentStatus.UNDER_REVIEW,
      },
    });

    this.logger.log(
      `Amendment proposal created: ${amendmentProposal.proposalNumber} from amendment ${amendmentId}`,
    );

    return {
      success: true,
      message: 'Amendment proposal created successfully',
      data: amendmentProposal,
    };
  }

  /**
   * PM completes amendment
   */
  async completeAmendment(amendmentId: string, user: User) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const amendment = await this.prisma.amendmentRequest.findUnique({
      where: { id: amendmentId },
      include: {
        amendmentProposal: true,
        proposal: true,
      },
    });

    if (!amendment) {
      throw new NotFoundException('Amendment request not found');
    }

    if (!amendment.amendmentProposalId) {
      throw new BadRequestException(
        'No proposal created for this amendment',
      );
    }

    if (amendment.amendmentProposal?.status !== ProposalStatus.ACCEPTED) {
      throw new BadRequestException(
        'Amendment proposal must be accepted before completion',
      );
    }

    const completed = await this.prisma.amendmentRequest.update({
      where: { id: amendmentId },
      data: {
        status: AmendmentStatus.COMPLETED,
        completedAt: new Date(),
        completedBy: user.id,
      },
      include: {
        proposal: true,
        amendmentProposal: true,
      },
    });

    this.logger.log(`Amendment ${amendmentId} completed by ${user.email}`);

    // Send completion notification
    await this.notifyAmendmentCompleted(completed);

    return {
      success: true,
      message: 'Amendment marked as completed',
      data: completed,
    };
  }

  /**
   * Get all amendment requests (PM dashboard)
   */
  async getAllAmendmentRequests(user: User, status?: string) {
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const where: Prisma.AmendmentRequestWhereInput = {};

    if (status) {
      where.status = status as AmendmentStatus;
    }

    const amendments = await this.prisma.amendmentRequest.findMany({
      where,
      include: {
        proposal: {
          select: {
            id: true,
            proposalNumber: true,
            projectName: true,
            clientName: true,
          },
        },
        requestedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        amendmentProposal: {
          select: {
            id: true,
            proposalNumber: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      message: 'Successfully retrieved all amendment requests',
      data: amendments,
    };
  }

  /**
   * Get all proposals for a project (normal + amendments)
   */
  async getAllProposalsForProject(proposalId: string, user: User) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Check permissions
    const isManager = this.canManage(user);
    const isClient =
      proposal.userId === user.id || proposal.clientEmail === user.email;

    if (!isManager && !isClient) {
      throw new ForbiddenException('Not authorized');
    }

    // Get the root proposal (in case this is an amendment)
    const rootProposalId = proposal.parentProposalId || proposalId;

    // Get all proposals (root + amendments)
    const allProposals = await this.prisma.proposal.findMany({
      where: {
        OR: [
          { id: rootProposalId },
          { parentProposalId: rootProposalId },
        ],
      },
      include: {
        services: {
          orderBy: { order: 'asc' },
        },
        parentProposal: {
          select: {
            id: true,
            proposalNumber: true,
            projectName: true,
          },
        },
        amendments: {
          select: {
            id: true,
            proposalNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Separate by type
    const normalProposal = allProposals.find(
      (p) => p.proposalType === ProposalType.NORMAL,
    );
    const amendmentProposals = allProposals.filter(
      (p) => p.proposalType === ProposalType.AMENDMENT,
    );

    return {
      success: true,
      message: 'Successfully retrieved all proposals',
      data: {
        normalProposal,
        amendmentProposals,
        totalProposals: allProposals.length,
      },
    };
  }

  // ============ Email Notifications ============

  private async notifyManagersNewAmendment(amendment: any) {
    try {
      const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
      
      const managers = await this.prisma.user.findMany({
        where: {
          role: { in: this.MANAGER_ROLES_ARRAY as any },
          isActive: true,
        },
        select: { email: true, name: true },
      });

      for (const manager of managers) {
        await this.mailer.sendMail({
          to: manager.email,
          subject: `New Amendment Request: ${amendment.proposal.projectName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">🔔 New Amendment Request</h2>
              <p>Hello ${manager.name || 'Team Member'},</p>
              <p>A client has submitted a new amendment request for their proposal.</p>
              
              <div style="background: #fffbeb; padding: 20px; border-left: 4px solid #f59e0b; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0;">Amendment Details</h3>
                <p><strong>Client:</strong> ${amendment.proposal.clientName}</p>
                <p><strong>Original Proposal:</strong> ${amendment.proposal.proposalNumber}</p>
                <p><strong>Project Name:</strong> ${amendment.projectName}</p>
                <p><strong>Urgency:</strong> ${amendment.urgency}</p>
              </div>
              
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Description:</strong></p>
                <p style="margin: 5px 0;">${amendment.description}</p>
                <p style="margin: 10px 0 5px 0;"><strong>Requested Services:</strong></p>
                <p style="margin: 5px 0;">${amendment.services}</p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${frontendUrl}/admin/amendments/${amendment.id}" 
                   style="background: #2563eb; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; display: inline-block;">
                  Review Amendment Request
                </a>
              </div>
            </div>
          `,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to send amendment notification: ${error}`);
    }
  }

  private async notifyClientReviewDecision(amendment: any, action: string) {
    try {
      const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
      const isApproved = action === 'APPROVED';
      const statusColor = isApproved ? '#10b981' : '#ef4444';
      const statusText = isApproved ? 'Approved' : 'Rejected';

      await this.mailer.sendMail({
        to: amendment.proposal.clientEmail,
        subject: `Amendment Request ${statusText}: ${amendment.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${statusColor};">${isApproved ? '✅' : '❌'} Amendment Request ${statusText}</h2>
            <p>Dear ${amendment.proposal.clientName},</p>
            <p>Your amendment request has been ${statusText.toLowerCase()}.</p>
            
            <div style="background: ${isApproved ? '#f0fdf4' : '#fef2f2'}; padding: 20px; 
                        border-left: 4px solid ${statusColor}; margin: 20px 0;">
              <p><strong>Amendment:</strong> ${amendment.projectName}</p>
              <p><strong>Status:</strong> ${statusText}</p>
              ${amendment.reviewNotes ? `<p><strong>Notes:</strong> ${amendment.reviewNotes}</p>` : ''}
            </div>
            
            ${
              isApproved
                ? `<p>Our team will create a proposal for this amendment shortly.</p>`
                : `<p>If you have any questions, please contact us.</p>`
            }
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${frontendUrl}/proposals/${amendment.proposalId}/amendments/${amendment.id}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                View Amendment
              </a>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send review decision email: ${error}`);
    }
  }

  private async notifyAmendmentCompleted(amendment: any) {
    try {
      const frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');

      await this.mailer.sendMail({
        to: amendment.proposal.clientEmail,
        subject: `Amendment Completed: ${amendment.projectName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #10b981;">🎉 Amendment Completed</h2>
            <p>Dear ${amendment.proposal.clientName},</p>
            <p>Your amendment request has been completed!</p>
            
            <div style="background: #f0fdf4; padding: 20px; border-left: 4px solid #10b981; margin: 20px 0;">
              <p><strong>Amendment:</strong> ${amendment.projectName}</p>
              <p><strong>Proposal:</strong> ${amendment.amendmentProposal.proposalNumber}</p>
              <p><strong>Status:</strong> Completed</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${frontendUrl}/proposals/${amendment.proposalId}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                View Proposal
              </a>
            </div>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(`Failed to send completion email: ${error}`);
    }
  }
}