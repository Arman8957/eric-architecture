import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectDocumentKind, User, UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryStrategy } from 'src/upload/strategies/cloudinary.strategy';

/** Matches what the New Project intake form accepts for these three fields. */
const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

const MAX_BYTES = 15 * 1024 * 1024;

@Injectable()
export class ProjectDocumentService {
  private readonly logger = new Logger(ProjectDocumentService.name);

  private readonly MANAGE_ROLES = new Set<UserRole>([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROJECT_MANAGER,
  ]);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryStrategy,
  ) {}

  private canManage(user: User): boolean {
    return this.MANAGE_ROLES.has(user.role);
  }

  /**
   * A client reads and writes documents on their own project only, and only
   * once the consultation fee is paid — the same gate the shared folder and
   * the meetings tab use. Staff are never gated.
   */
  private async assertClientAccess(projectRequestId: string, user: User) {
    const project = await this.prisma.projectRequest.findUnique({
      where: { id: projectRequestId },
      select: { userId: true, consultationPaymentId: true },
    });

    if (!project || project.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }
    if (!project.consultationPaymentId) {
      throw new ForbiddenException(
        'Pay the consultation fee to manage project documents',
      );
    }
  }

  private async assertAccess(projectRequestId: string, user: User) {
    if (this.canManage(user)) {
      const project = await this.prisma.projectRequest.findUnique({
        where: { id: projectRequestId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project request not found');
      }
      return;
    }
    await this.assertClientAccess(projectRequestId, user);
  }

  async getForProject(projectRequestId: string, user: User) {
    await this.assertAccess(projectRequestId, user);

    return this.prisma.projectDocument.findMany({
      where: { projectRequestId },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The client uploads one of the three intake documents, at any point in the
   * project's life. Boundary and geotechnical are single-slot — re-uploading
   * replaces what is there, since a project has one of each — while photos
   * accumulate.
   */
  async upload(
    projectRequestId: string,
    kind: ProjectDocumentKind,
    file: Express.Multer.File,
    user: User,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    if (!Object.values(ProjectDocumentKind).includes(kind)) {
      throw new BadRequestException('Unknown document type');
    }
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(
        'Upload a PDF or an image (JPG, PNG, WEBP, HEIC)',
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Files must be 15MB or smaller');
    }

    await this.assertAccess(projectRequestId, user);

    const uploaded = await this.cloudinary.upload(
      file,
      `project-documents/${projectRequestId}`,
    );

    // One boundary map and one geotechnical report per project; a new upload
    // supersedes the old one rather than stacking duplicates.
    const isSingleSlot = kind !== ProjectDocumentKind.PROJECT_PHOTO;
    if (isSingleSlot) {
      const previous = await this.prisma.projectDocument.findMany({
        where: { projectRequestId, kind },
      });
      if (previous.length) {
        await this.prisma.projectDocument.deleteMany({
          where: { id: { in: previous.map((p) => p.id) } },
        });
        await Promise.all(previous.map((p) => this.destroyAsset(p.publicId)));
      }
    }

    const created = await this.prisma.projectDocument.create({
      data: {
        projectRequestId,
        kind,
        fileName: file.originalname,
        url: uploaded.url,
        publicId: uploaded.publicId,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: user.id,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    this.logger.log(
      `Project document ${created.id} (${kind}) uploaded to ${projectRequestId} by ${user.email}`,
    );

    return created;
  }

  /**
   * Only the client side removes these — they are the client's files. Staff
   * read them but cannot delete, mirroring how the shared folder keeps each
   * side's links their own.
   */
  async remove(documentId: string, user: User) {
    const existing = await this.prisma.projectDocument.findUnique({
      where: { id: documentId },
    });

    if (!existing) {
      throw new NotFoundException('Document not found');
    }
    if (this.canManage(user)) {
      throw new ForbiddenException(
        'This document was uploaded by the client and can only be removed by them',
      );
    }

    await this.assertClientAccess(existing.projectRequestId, user);

    await this.prisma.projectDocument.delete({ where: { id: documentId } });
    await this.destroyAsset(existing.publicId);

    return { success: true, message: 'Document deleted successfully' };
  }

  /** A failed remote delete leaves an orphan file, never a broken response. */
  private async destroyAsset(publicId: string | null) {
    if (!publicId) return;
    try {
      await this.cloudinary.delete(publicId);
    } catch (err) {
      this.logger.warn(
        `Could not remove ${publicId} from Cloudinary: ${(err as Error).message}`,
      );
    }
  }
}
