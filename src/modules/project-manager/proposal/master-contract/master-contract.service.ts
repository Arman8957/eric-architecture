import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { TX_OPTIONS } from 'src/common/prisma-transaction';
import {
  CreateMasterContractDto,
  UpdateMasterContractDto,
  ClientSignContractDto,
} from '../dto/master-contract.dto';
import {
  User,
  UserRole,
  RequestStatus,
  StageStatus,
  ProposalStatus,
  ProposalType,
  AmendmentStatus,
} from '@prisma/client';

@Injectable()
export class MasterContractService {
  private readonly logger = new Logger(MasterContractService.name);

  constructor(private prisma: PrismaService) {}

  async findAll() {
    const articles = await this.prisma.masterContract.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    return {
      success: true,
      message: 'Master contract articles retrieved',
      data: articles,
    };
  }

  async findOne(id: string) {
    const article = await this.prisma.masterContract.findUnique({
      where: { id },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    return {
      success: true,
      message: 'Article retrieved',
      data: article,
    };
  }

  async create(dto: CreateMasterContractDto) {
    const article = await this.prisma.masterContract.create({
      data: {
        articleKey: dto.articleKey,
        title: dto.title,
        content: dto.content,
        order: dto.order ?? 0,
      },
    });

    return {
      success: true,
      message: 'Contract article created',
      data: article,
    };
  }

  async update(id: string, dto: UpdateMasterContractDto) {
    const existing = await this.prisma.masterContract.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Article not found');
    }

    const article = await this.prisma.masterContract.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return {
      success: true,
      message: 'Contract article updated',
      data: article,
    };
  }

  async delete(id: string) {
    const existing = await this.prisma.masterContract.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Article not found');
    }

    await this.prisma.masterContract.delete({ where: { id } });

    return {
      success: true,
      message: 'Contract article deleted',
    };
  }

  // Seed default contract articles from the existing static content
  async seedDefaults() {
    const defaults = [
      {
        articleKey: 'article_1_definitions',
        title: 'Article 1 - Definitions',
        content: `To establish a clear understanding, the following terms are defined for use throughout this Agreement:

"Architect" refers to Architecture Simple, represented by Eric Rivera, AIA, who will provide professional architectural services as detailed in this Agreement.

"Work" refers to all architectural, engineering, and related professional services required for the design, development, and documentation of the Project, as set forth in the Scope of Services.

"Design Documents" (DDs) refers to the completed Schematic Design and Design Development documents, including all drawings, specifications, and other materials prepared by the Architect.

"Construction Documents" (CDs) refers to the completed set of final documents that provide the necessary details for construction and permitting, including plans, specifications, and other materials.

"Bidding Documents" refers to the final Construction Documents and any related documents issued to contractors or bidders.

"Substantial Completion" means the point in time when the Project is sufficiently complete in accordance with the Contract Documents, allowing the Owner to occupy or utilize the building for its intended use.

"Completion" refers to the final completion of all construction work, including punch list items and final inspections.`,
        order: 1,
      },
      {
        articleKey: 'article_2_scope',
        title: 'Article 2 - Scope of Services',
        content:
          'The Architect agrees to provide the following services for the Project as outlined in the Proposal.',
        order: 2,
      },
      {
        articleKey: 'article_3_payment',
        title: 'Article 3 - Payment Terms',
        content: `3.3 Payment Terms

All invoices are due within 30 days. Late payments are subject to 1.5% monthly interest.`,
        order: 3,
      },
      {
        articleKey: 'article_4_additional',
        title: 'Article 4 - Additional Services',
        content:
          'Additional services not specified in the Scope of Services may be provided upon request according to the Fee Schedule in Exhibit A.',
        order: 4,
      },
      {
        articleKey: 'article_5_owner',
        title: "Article 5 - Owner's Responsibilities",
        content: `The Owner agrees to:

• Provide all necessary documents, approvals, and site access.
• Secure all necessary approvals and permits from the AHJ.
• Notify the Architect of any scope changes and authorize additional services in writing.`,
        order: 5,
      },
      {
        articleKey: 'article_6_schedule',
        title: 'Article 6 - Schedule + Contact Information',
        content: `Design efforts begin upon acceptance and written notice to proceed.

Contact Information:
Eric Rivera, AIA, LEED
Principal, Architecture Simple
Email: eric@architecturesimple.com
Phone: +1 (925) 822-4374`,
        order: 6,
      },
      {
        articleKey: 'exhibit_a',
        title: 'Exhibit A: Professional Services Fee Schedule',
        content: `Principal: $200.00/Hour
Project Architect: $150.00/Hour
Project Manager: $130.00/Hour
Designer: $110.00/Hour
Job Captain: $90.00/Hour
CAD Technician: $80.00/Hour
Interior Design & Planning: $75.00/Hour`,
        order: 7,
      },
    ];

    const results: any[] = [];
    for (const item of defaults) {
      const existing = await this.prisma.masterContract.findUnique({
        where: { articleKey: item.articleKey },
      });

      if (!existing) {
        const created = await this.prisma.masterContract.create({
          data: item,
        });
        results.push(created);
      } else {
        results.push(existing);
      }
    }

    return {
      success: true,
      message: `Seeded ${results.length} contract articles`,
      data: results,
    };
  }

  // Client signs the contract on a proposal
  async clientSignContract(
    proposalId: string,
    dto: ClientSignContractDto,
    user: User,
  ) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      include: {
        services: { orderBy: { order: 'asc' } },
        projectRequest: true,
        user: true,
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Security: Only assigned client can sign
    if (proposal.userId !== user.id) {
      throw new ForbiddenException(
        'Only the assigned client can sign the contract',
      );
    }

    // Prevent double signing
    if (proposal.clientContractSignature) {
      throw new BadRequestException(
        'Contract has already been signed by the client',
      );
    }

    // Everything that only reads is resolved up front. The database is remote,
    // so each query inside an interactive transaction spends a network round
    // trip against the transaction's time budget — reads that need no
    // transactional guarantee must not be in there.
    let contractSections = proposal.contractSections;

    if (
      !contractSections ||
      (Array.isArray(contractSections) && contractSections.length === 0)
    ) {
      const defaultSections =
        proposal.proposalType === ProposalType.AMENDMENT
          ? await this.prisma.amendmentContract.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
          })
          : await this.prisma.masterContract.findMany({
            where: { isActive: true },
            orderBy: { order: 'asc' },
          });

      if (defaultSections.length === 0) {
        throw new BadRequestException('No contract sections available');
      }

      contractSections = defaultSections.map((s) => ({
        articleKey: s.articleKey,
        title: s.title,
        content: s.content,
        order: s.order,
      }));
    }

    const linkedAmendment = await this.prisma.amendmentRequest.findUnique({
      where: { amendmentProposalId: proposalId },
      select: { id: true, status: true },
    });

    // Read outside the transaction — it only decides whether the project clock
    // has already been started, and holding a round trip inside the transaction
    // spends its time budget for nothing.
    const existingProject = proposal.projectRequestId
      ? await this.prisma.projectRequest.findUnique({
        where: { id: proposal.projectRequestId },
        select: { projectStartedAt: true },
      })
      : null;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Update proposal with signature
        const updatedProposal = await tx.proposal.update({
          where: { id: proposalId },
          data: {
            clientContractSignature: dto.clientSignature,
            clientContractSignedAt: new Date(),
            status: ProposalStatus.ACCEPTED,
            contractSections: contractSections as any,
          },
          include: {
            services: { orderBy: { order: 'asc' } },
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        });

        // Activate project request.
        //
        // The clock belongs to the project, not to the contract being signed.
        // Signing an amendment runs this same path, so stamping the start date
        // unconditionally used to restart the timer every time an amendment was
        // accepted. Only the first signature sets it; later ones leave it alone
        // and a completed project reopens with its original start intact.
        if (proposal.projectRequestId) {
          await tx.projectRequest.update({
            where: { id: proposal.projectRequestId },
            data: {
              status: RequestStatus.ACTIVE,
              isProjectStarted: true,
              ...(existingProject?.projectStartedAt
                ? {}
                : { projectStartedAt: new Date() }),
              // New work reopens a project that had run to completion.
              projectCompletedAt: null,
            },
          });
        }

        // Create project stages from services
        const stagesToCreate = updatedProposal.services.map(
          (service, index) => ({
            proposalId: proposal.id,
            projectRequestId: proposal.projectRequestId,
            name: service.name,
            description: `Phase for ${service.name}`,
            order: service.order || index,
            status: StageStatus.NOT_STARTED,
            progress: 0,
          }),
        );

        if (stagesToCreate.length > 0) {
          await tx.projectStage.createMany({
            data: stagesToCreate,
          });
        }

        // Signing an amendment proposal closes out the amendment request that
        // spawned it, so the studio stops offering Accept/Reject on a request
        // that has already been fulfilled.
        if (
          linkedAmendment &&
          linkedAmendment.status !== AmendmentStatus.COMPLETED
        ) {
          await tx.amendmentRequest.update({
            where: { id: linkedAmendment.id },
            data: {
              status: AmendmentStatus.COMPLETED,
              completedAt: new Date(),
            },
          });
        }

        return updatedProposal;
      }, TX_OPTIONS);

      this.logger.log(
        `Client ${user.email} successfully signed proposal ${proposalId}`,
      );

      return {
        success: true,
        message: 'Contract signed successfully and project phases initialized',
        data: result,
      };
    } catch (error: unknown) {
      const err = error as Error;

      this.logger.error(
        `Failed to sign contract for proposal ${proposalId}: ${err.message}`,
        err.stack,
      );

      throw new BadRequestException(`Failed to sign contract: ${err.message}`);
    }
  }

  // Get contract data for a specific proposal
  async getContractForProposal(proposalId: string, user: User) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id: proposalId },
      select: {
        id: true,
        proposalNumber: true,
        createdAt: true,
        proposalType: true,
        // The client-facing Payment Terms article renders its own fee summary
        // ("3.1 Payment Structure") from these, mirroring the PM's review page.
        paymentType: true,
        paymentMethod: true,
        subtotal: true,
        totalAmount: true,
        contractSections: true,
        architectContractSignature: true,
        clientContractSignature: true,
        clientContractSignedAt: true,
        architectSignature: true,
        architectSignedAt: true,
        ownerSignature: true,
        ownerSignedAt: true,
        clientName: true,
        projectName: true,
        projectLocation: true,
        serviceType: true,
        projectDescription: true,
        additionalContext: true,
        status: true,
        notes: true,
        userId: true,
        projectRequest: {
          select: {
            projectCity: true,
            projectState: true,
            city: true,
            state: true,
          },
        },
        services: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            name: true,
            amount: true,
            order: true,
            timelineWeeks: true,
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException('Proposal not found');
    }

    // Flatten projectRequest fields into the response for convenience
    const { projectRequest, ...rest } = proposal;
    const city = projectRequest?.projectCity || projectRequest?.city || '';
    const state = projectRequest?.projectState || projectRequest?.state || '';

    return {
      success: true,
      message: 'Contract data retrieved',
      data: {
        ...rest,
        city,
        state,
      },
    };
  }
}
