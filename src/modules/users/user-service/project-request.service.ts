import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { UserRole, RequestStatus } from '@prisma/client';
import { RequestStatus as StatusEnum } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProjectRequestDto } from '../dto/project-request.dto';
import { QueryProjectRequestDto } from '../dto/query-project-request.dto';
import { UpdateProjectRequestDto } from '../dto/update-project-request.dto';
import { success } from 'zod';

@Injectable()
export class ProjectRequestService {
  private readonly logger = new Logger(ProjectRequestService.name);

  constructor(private prisma: PrismaService) {}

  private readonly allowedTransitions: Record<RequestStatus, RequestStatus[]> =
    {
      [StatusEnum.PENDING]: [StatusEnum.REVIEWED, StatusEnum.CANCELLED],
      [StatusEnum.REVIEWED]: [StatusEnum.SCHEDULED, StatusEnum.CANCELLED],
      [StatusEnum.SCHEDULED]: [StatusEnum.COMPLETED, StatusEnum.CANCELLED],
      [StatusEnum.COMPLETED]: [],
      [StatusEnum.CANCELLED]: [],
      [StatusEnum.ACTIVE]: [StatusEnum.COMPLETED, StatusEnum.CANCELLED],
    };

  private isStaff(userRole: UserRole): boolean {
    return userRole !== UserRole.USER;
  }

  async create(
    dto: CreateProjectRequestDto,
    files: Express.Multer.File[],
    userId: string,
  ) {
    try {
      const projectData = dto.projectLocationSameAsClient
        ? {
            projectCountry: dto.country || 'United States',
            projectState: dto.state,
            projectCity: dto.city,
            projectStreetAddress: dto.streetAddress,
          }
        : {
            projectCountry: dto.projectCountry,
            projectState: dto.projectState,
            projectCity: dto.projectCity,
            projectStreetAddress: dto.projectStreetAddress,
          };

      const request = await this.prisma.projectRequest.create({
        data: {
          clientFirstName: dto.clientFirstName.trim(),
          clientMiddleName: dto.clientMiddleName?.trim(),
          clientLastName: dto.clientLastName.trim(),
          companyName: dto.companyName?.trim(),
          email: dto.email.toLowerCase().trim(),
          phone: dto.phone?.trim(),
          country: dto.country || 'United States',
          state: dto.state?.trim(),
          city: dto.city?.trim(),
          streetAddress: dto.streetAddress?.trim(),
          additionalComments: dto.additionalComments?.trim(),
          projectName: dto.projectName.trim(),
          projectLocationSameAsClient: dto.projectLocationSameAsClient ?? false,
          ...projectData,
          projectZipCode: dto.projectZipCode?.trim(),
          serviceType: dto.serviceType,
          projectCategory: dto.projectCategory,
          projectSize: dto.projectSize?.trim(),
          budgetRange: dto.budgetRange?.trim(),
          preferredArchitecturalStyle: dto.preferredArchitecturalStyle?.trim(),
          siteConstraints: dto.siteConstraints?.trim(),
          sustainabilityGoals: dto.sustainabilityGoals?.trim(),
          specialRequirements: dto.specialRequirements?.trim(),
          appointmentDate: dto.appointmentDate
            ? new Date(dto.appointmentDate)
            : null,
          appointmentTime: dto.appointmentTime?.trim(),
          appointmentType: dto.appointmentType?.trim(),
          additionalNotes: dto.additionalNotes?.trim(),
          userId: userId || null,
          status: StatusEnum.PENDING,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      this.logger.log(
        `Project request created: ${request.id} by ${userId || 'anonymous'}`,
      );

      return request;
    } catch (error) {
      this.logger.error('Create project request failed', error.stack);
      throw new BadRequestException('Failed to create project request');
    }
  }

  async uploadFile(
    requestId: string,
    file: Express.Multer.File,
    userId: string,
    userRole: UserRole,
  ) {
    const request = await this.prisma.projectRequest.findUnique({
      where: { id: requestId, deletedAt: null },
    });

    if (!request) throw new NotFoundException('Request not found');

    if (!this.isStaff(userRole) && request.userId !== userId) {
      throw new ForbiddenException('You can only upload to your own requests');
    }

    const originalUrl = `https://example.com/uploads/${file.originalname}`;
    const cdnUrl = originalUrl; // replace with real CDN URL

    const asset = await this.prisma.projectAsset.create({
      data: {
        projectRequestId: requestId,
        type: 'DOCUMENT_1D', // determine based on mimeType
        originalUrl,
        cdnUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        title: file.originalname,
        uploadedById: userId,
      },
    });

    return { message: 'File uploaded successfully', asset };
  }

  async findAll(query: QueryProjectRequestDto, userRole: UserRole) {
    if (!this.isStaff(userRole)) {
      throw new ForbiddenException('Only staff can view all requests');
    }

    const { page = 1, limit = 10, status, serviceType, email } = query;

    const where: any = { deletedAt: null };

    if (status) where.status = status;
    if (serviceType) where.serviceType = serviceType;
    if (email) where.email = { contains: email.toLowerCase() };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.projectRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          assets: {
            select: { id: true, type: true, title: true, cdnUrl: true },
          },
        },
      }),
      this.prisma.projectRequest.count({ where }),
    ]);

    return {
      success: true,
      message: `Found ${data.length} project requests (page ${page} of ${Math.ceil(total / limit)})`,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMyRequests(userId: string, query: QueryProjectRequestDto) {
    const { page = 1, limit = 10, status, serviceType } = query;

    const where: any = { userId, deletedAt: null };

    if (status) where.status = status;
    if (serviceType) where.serviceType = serviceType;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.projectRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assets: {
            select: { id: true, title: true, cdnUrl: true, type: true },
          },
        },
      }),
      this.prisma.projectRequest.count({ where }),
    ]);

    return {
      success: true,
      message:
        data.length === 0
          ? 'No project requests found for your account'
          : `Found ${data.length} of your project requests`,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string, userId: string, userRole: UserRole) {
    const request = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assets: true,
      },
    });

    if (!request) throw new NotFoundException('Project request not found');

    // Staff can view all, users can only view their own
    if (!this.isStaff(userRole) && request.userId !== userId) {
      throw new ForbiddenException('You can only view your own requests');
    }

    return {
      success: true,
      message: 'Here your single data of the project request',
      data: request,
    };
  }

  async update(
    id: string,
    dto: UpdateProjectRequestDto,
    userId: string,
    userRole: UserRole,
  ) {
    const existing = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existing) throw new NotFoundException('Project request not found');

    // Check permissions
    if (!this.isStaff(userRole) && existing.userId !== userId) {
      throw new ForbiddenException('You can only update your own requests');
    }

    // Status transition validation
    if (dto.status && existing.status !== dto.status) {
      // Only staff can change status
      if (!this.isStaff(userRole)) {
        throw new ForbiddenException('Only staff can change request status');
      }

      // Validate transition
      if (!this.allowedTransitions[existing.status].includes(dto.status)) {
        throw new BadRequestException(
          `Cannot change status from ${existing.status} to ${dto.status}`,
        );
      }
    }

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: {
        ...dto,
        email: dto.email ? dto.email.toLowerCase().trim() : undefined,
        appointmentDate: dto.appointmentDate
          ? new Date(dto.appointmentDate)
          : undefined,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assets: true,
      },
    });

    this.logger.log(`Project request ${id} updated by ${userId}`);

    return updated;
  }

  async softDelete(id: string, userId: string, userRole: UserRole) {
    const existing = await this.prisma.projectRequest.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt) {
      throw new NotFoundException('Request not found');
    }

    // Check permissions
    if (!this.isStaff(userRole) && existing.userId !== userId) {
      throw new ForbiddenException('You can only delete your own requests');
    }

    await this.prisma.projectRequest.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.warn(`Project request ${id} soft-deleted by ${userId}`);

    return { message: 'Project request deleted successfully' };
  }

  async getStats(userRole: UserRole) {
    if (!this.isStaff(userRole)) {
      throw new ForbiddenException('Only staff can view statistics');
    }

    const [total, pending, reviewed, scheduled, completed, cancelled, active] =
      await Promise.all([
        this.prisma.projectRequest.count({ where: { deletedAt: null } }),
        this.prisma.projectRequest.count({
          where: { status: StatusEnum.PENDING, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { status: StatusEnum.REVIEWED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { status: StatusEnum.SCHEDULED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { status: StatusEnum.COMPLETED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { status: StatusEnum.CANCELLED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { status: StatusEnum.ACTIVE, deletedAt: null },
        }),
      ]);

    return {
      success: true,
      message:
        total === 0
          ? 'No project requests found for your account yet'
          : 'Your project request statistics retrieved successfully',
      data: {
        total,
        byStatus: {
          pending,
          reviewed,
          scheduled,
          completed,
          cancelled,
          active,
        },
      },
    };
  }

  async getMyStats(userId: string) {
    const [total, pending, reviewed, scheduled, completed, cancelled, active] =
      await Promise.all([
        this.prisma.projectRequest.count({
          where: { userId, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.PENDING, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.REVIEWED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.SCHEDULED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.COMPLETED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.CANCELLED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.ACTIVE, deletedAt: null },
        }),
      ]);

    return {
      success: true,
      message: 'Global project request statistics retrieved successfully',
      data: {
        total,
        byStatus: {
          pending,
          reviewed,
          scheduled,
          completed,
          cancelled,
          active,
        },
      },
    };
  }

  //======================make it for users======================

  async findAllForUser(userId: string, query: QueryProjectRequestDto) {
    const { page = 1, limit = 10, status, serviceType } = query;

    const where: any = {
      userId,
      deletedAt: null,
    };

    if (status) where.status = status;
    if (serviceType) where.serviceType = serviceType;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.projectRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assets: {
            select: {
              id: true,
              title: true,
              cdnUrl: true,
              type: true,
            },
          },
        },
      }),
      this.prisma.projectRequest.count({ where }),
    ]);

    return {
      success: true,
      message:
        data.length === 0
          ? 'No project requests found for your account'
          : `Found ${data.length} of your project requests (page ${page})`,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneForUser(id: string, userId: string) {
    const request = await this.prisma.projectRequest.findUnique({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assets: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Project request not found');
    }

    if (request.userId !== userId) {
      throw new ForbiddenException(
        'You can only view your own project requests',
      );
    }

    return {
      success: true,
      message: 'Your project request retrieved successfully',
      data: request,
    };
  }

  async updateForUser(
    id: string,
    dto: UpdateProjectRequestDto,
    userId: string,
  ) {
    const existing = await this.prisma.projectRequest.findUnique({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Project request not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException(
        'You can only update your own project requests',
      );
    }

    // Regular users usually cannot change status
    if (dto.status && existing.status !== dto.status) {
      throw new ForbiddenException('Only staff can change request status');
    }

    const updated = await this.prisma.projectRequest.update({
      where: { id },
      data: {
        ...dto,
        email: dto.email ? dto.email.toLowerCase().trim() : undefined,
        appointmentDate: dto.appointmentDate
          ? new Date(dto.appointmentDate)
          : undefined,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assets: true,
      },
    });

    this.logger.log(`Project request ${id} updated by user ${userId}`);

    return updated;
  }

  async getStatsForUser(userId: string) {
    const [total, pending, reviewed, scheduled, completed, cancelled, active] =
      await Promise.all([
        this.prisma.projectRequest.count({
          where: { userId, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.PENDING, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.REVIEWED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.SCHEDULED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.COMPLETED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.CANCELLED, deletedAt: null },
        }),
        this.prisma.projectRequest.count({
          where: { userId, status: StatusEnum.ACTIVE, deletedAt: null },
        }),
      ]);

    return {
      total,
      byStatus: {
        pending,
        reviewed,
        scheduled,
        completed,
        cancelled,
        active,
      },
    };
  }
}

// import {
//   Injectable,
//   NotFoundException,
//   BadRequestException,
//   ForbiddenException,
//   Logger,
// } from '@nestjs/common';

// import { UserRole, RequestStatus } from '@prisma/client';
// import { RequestStatus as StatusEnum } from '@prisma/client';
// import { PrismaService } from 'src/prisma/prisma.service';
// import { CreateProjectRequestDto } from '../dto/project-request.dto';
// import { QueryProjectRequestDto } from '../dto/query-project-request.dto';
// import { UpdateProjectRequestDto } from '../dto/update-project-request.dto';

// @Injectable()
// export class ProjectRequestService {
//   private readonly logger = new Logger(ProjectRequestService.name);

//   constructor(private prisma: PrismaService) {}

//   private readonly allowedTransitions: Record<RequestStatus, RequestStatus[]> = {
//     [StatusEnum.PENDING]: [StatusEnum.REVIEWED, StatusEnum.CANCELLED],
//     [StatusEnum.REVIEWED]: [StatusEnum.SCHEDULED, StatusEnum.CANCELLED],
//     [StatusEnum.SCHEDULED]: [StatusEnum.COMPLETED, StatusEnum.CANCELLED],
//     [StatusEnum.COMPLETED]: [],
//     [StatusEnum.CANCELLED]: [],
//     [StatusEnum.ACTIVE]: []

//   };

//   async create(dto: CreateProjectRequestDto, files: Express.Multer.File[], userId?: string) {
//     try {
//       const projectData = dto.projectLocationSameAsClient
//         ? {
//             projectCountry: dto.country || 'United States',
//             projectState: dto.state,
//             projectCity: dto.city,
//             projectStreetAddress: dto.streetAddress,
//           }
//         : {
//             projectCountry: dto.projectCountry,
//             projectState: dto.projectState,
//             projectCity: dto.projectCity,
//             projectStreetAddress: dto.projectStreetAddress,
//           };

//       const request = await this.prisma.projectRequest.create({
//         data: {
//           clientFirstName: dto.clientFirstName.trim(),
//           clientMiddleName: dto.clientMiddleName?.trim(),
//           clientLastName: dto.clientLastName.trim(),
//           companyName: dto.companyName?.trim(),
//           email: dto.email.toLowerCase().trim(),
//           phone: dto.phone?.trim(),
//           country: dto.country || 'United States',
//           state: dto.state?.trim(),
//           city: dto.city?.trim(),
//           streetAddress: dto.streetAddress?.trim(),
//           additionalComments: dto.additionalComments?.trim(),

//           projectName: dto.projectName.trim(),
//           projectLocationSameAsClient: dto.projectLocationSameAsClient ?? false,
//           ...projectData,
//           projectZipCode: dto.projectZipCode?.trim(),
//           serviceType: dto.serviceType,
//           projectCategory: dto.projectCategory,
//           projectSize: dto.projectSize?.trim(),
//           budgetRange: dto.budgetRange?.trim(),

//           preferredArchitecturalStyle: dto.preferredArchitecturalStyle?.trim(),
//           siteConstraints: dto.siteConstraints?.trim(),
//           sustainabilityGoals: dto.sustainabilityGoals?.trim(),
//           specialRequirements: dto.specialRequirements?.trim(),

//           appointmentDate: dto.appointmentDate ? new Date(dto.appointmentDate) : null,
//           appointmentTime: dto.appointmentTime?.trim(),
//           appointmentType: dto.appointmentType?.trim(),
//           additionalNotes: dto.additionalNotes?.trim(),

//           userId: userId || null,
//           status: StatusEnum.PENDING,
//         },
//         include: {
//           user: { select: { id: true, name: true, email: true } },
//         },
//       });

//       this.logger.log(`Project request created: ${request.id} by ${userId || 'anonymous'}`);
//       // TODO: Send notification to admin + confirmation to client

//       return request;
//     } catch (error) {
//       this.logger.error('Create project request failed', error.stack);
//       throw new BadRequestException('Failed to create project request');
//     }
//   }

//   async uploadFile(
//     requestId: string,
//     file: Express.Multer.File,
//     userId: string,
//     userRole: UserRole,
//   ) {
//     const request = await this.prisma.projectRequest.findUnique({
//       where: { id: requestId },
//     });

//     if (!request) throw new NotFoundException('Request not found');

//     // Only owner or staff can upload
//     const isStaff = userRole !== UserRole.USER;
//     if (!isStaff && request.userId !== userId) {
//       throw new ForbiddenException('You can only upload to your own requests');
//     }

//     // TODO: Upload file to storage (S3/Cloudinary/local) and get URLs
//     const originalUrl = `https://example.com/uploads/${file.originalname}`;
//     const cdnUrl = originalUrl; // replace with real CDN URL

//     const asset = await this.prisma.projectAsset.create({
//       data: {
//         projectRequestId: requestId,
//         type: 'DOCUMENT_1D', // determine based on mimeType
//         originalUrl,
//         cdnUrl,
//         fileSize: file.size,
//         mimeType: file.mimetype,
//         title: file.originalname,
//         uploadedById: userId,
//       },
//     });

//     return { message: 'File uploaded successfully', asset };
//   }

//   async findAll(query: QueryProjectRequestDto, userRole: UserRole) {
//     if (userRole === UserRole.USER) {
//       throw new ForbiddenException('Only staff can view all requests');
//     }

//     const { page = 1, limit = 10, status, serviceType, email } = query;

//     const where: any = { deletedAt: null };
//     if (status) where.status = status;
//     if (serviceType) where.serviceType = serviceType;
//     if (email) where.email = { contains: email.toLowerCase() };

//     const skip = (page - 1) * limit;

//     const [data, total] = await Promise.all([
//       this.prisma.projectRequest.findMany({
//         where,
//         skip,
//         take: limit,
//         orderBy: { createdAt: 'desc' },
//         include: {
//           user: { select: { id: true, name: true, email: true } },
//           assets: { select: { id: true, type: true, title: true, cdnUrl: true } },
//         },
//       }),
//       this.prisma.projectRequest.count({ where }),
//     ]);

//     return {
//       data,
//       meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
//     };
//   }

//   async findMyRequests(userId: string, query: QueryProjectRequestDto) {
//     const { page = 1, limit = 10, status, serviceType } = query;

//     const where: any = { userId, deletedAt: null };
//     if (status) where.status = status;
//     if (serviceType) where.serviceType = serviceType;

//     const skip = (page - 1) * limit;

//     const [data, total] = await Promise.all([
//       this.prisma.projectRequest.findMany({
//         where,
//         skip,
//         take: limit,
//         orderBy: { createdAt: 'desc' },
//         include: { assets: { select: { id: true, title: true, cdnUrl: true } } },
//       }),
//       this.prisma.projectRequest.count({ where }),
//     ]);

//     return {
//       data,
//       meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
//     };
//   }

//   async findOne(id: string, userId: string, userRole: UserRole) {
//     const request = await this.prisma.projectRequest.findUnique({
//       where: { id, deletedAt: null },
//       include: {
//         user: { select: { id: true, name: true, email: true } },
//         assets: true,
//       },
//     });

//     if (!request) throw new NotFoundException('Project request not found');

//     const isStaff = userRole !== UserRole.USER;
//     if (!isStaff && request.userId !== userId) {
//       throw new ForbiddenException('You can only view your own requests');
//     }

//     return request;
//   }

//   async update(
//     id: string,
//     dto: UpdateProjectRequestDto,
//     userId: string,
//     userRole: UserRole,
//   ) {
//     const existing = await this.prisma.projectRequest.findUnique({
//       where: { id, deletedAt: null },
//     });

//     if (!existing) throw new NotFoundException('Project request not found');

//     const isStaff = userRole !== UserRole.USER;

//     // Status transition validation
//     if (dto.status && existing.status !== dto.status) {
//       if (!this.allowedTransitions[existing.status].includes(dto.status)) {
//         throw new BadRequestException(
//           `Cannot change status from ${existing.status} to ${dto.status}`,
//         );
//       }
//     }

//     // Non-staff users can only update their own requests
//     if (!isStaff && existing.userId !== userId) {
//       throw new ForbiddenException('You can only update your own requests');
//     }

//     // Only staff can change status
//     if (dto.status && !isStaff) {
//       throw new ForbiddenException('Only staff can change request status');
//     }

//     const updated = await this.prisma.projectRequest.update({
//       where: { id },
//       data: {
//         ...dto,
//         email: dto.email ? dto.email.toLowerCase().trim() : undefined,
//         appointmentDate: dto.appointmentDate ? new Date(dto.appointmentDate) : undefined,
//       },
//       include: {
//         user: { select: { id: true, name: true, email: true } },
//         assets: true,
//       },
//     });

//     this.logger.log(`Project request ${id} updated by ${userId}`);
//     return updated;
//   }

//   async softDelete(id: string, userId: string, userRole: UserRole) {
//     const existing = await this.prisma.projectRequest.findUnique({
//       where: { id },
//     });

//     if (!existing || existing.deletedAt) throw new NotFoundException('Request not found');

//     const isStaff = userRole !== UserRole.USER;
//     if (!isStaff && existing.userId !== userId) {
//       throw new ForbiddenException('You can only delete your own requests');
//     }

//     await this.prisma.projectRequest.update({
//       where: { id },
//       data: { deletedAt: new Date() },
//     });

//     this.logger.warn(`Project request ${id} soft-deleted by ${userId}`);
//     return { message: 'Project request deleted successfully (soft delete)' };
//   }

//   async getStats(userRole: UserRole) {
//     if (userRole === UserRole.USER) {
//       throw new ForbiddenException('Only staff can view statistics');
//     }

//     const [total, pending, reviewed, scheduled, completed, cancelled] = await Promise.all([
//       this.prisma.projectRequest.count({ where: { deletedAt: null } }),
//       this.prisma.projectRequest.count({ where: { status: StatusEnum.PENDING, deletedAt: null } }),
//       this.prisma.projectRequest.count({ where: { status: StatusEnum.REVIEWED, deletedAt: null } }),
//       this.prisma.projectRequest.count({ where: { status: StatusEnum.SCHEDULED, deletedAt: null } }),
//       this.prisma.projectRequest.count({ where: { status: StatusEnum.COMPLETED, deletedAt: null } }),
//       this.prisma.projectRequest.count({ where: { status: StatusEnum.CANCELLED, deletedAt: null } }),
//     ]);

//     return {
//       total,
//       byStatus: { pending, reviewed, scheduled, completed, cancelled },
//     };
//   }
// }
