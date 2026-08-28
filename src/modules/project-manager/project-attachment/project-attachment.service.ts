import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class ProjectAttachmentService {
  private readonly MANAGE_ROLES = new Set<UserRole>([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.PROJECT_MANAGER,
  ]);

  constructor(private prisma: PrismaService) {}

  private canManage(user: User): boolean {
    return this.MANAGE_ROLES.has(user.role);
  }

  /**
   * A client may view, add and manage documents for their own project, but
   * only once the consultation fee is paid — the same gate the meetings and
   * deliverables use. Managers are never gated.
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
        'Pay the consultation fee to access project documents',
      );
    }
  }

  async getForProject(projectRequestId: string, user: User) {
    if (!this.canManage(user)) {
      await this.assertClientAccess(projectRequestId, user);
    }

    return this.prisma.projectAttachment.findMany({
      where: { projectRequestId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    projectRequestId: string,
    dto: { title: string; url: string },
    user: User,
  ) {
    if (!dto.title?.trim() || !dto.url?.trim()) {
      throw new BadRequestException('Title and URL are required');
    }

    if (this.canManage(user)) {
      const project = await this.prisma.projectRequest.findUnique({
        where: { id: projectRequestId },
        select: { id: true },
      });
      if (!project) {
        throw new NotFoundException('Project request not found');
      }
    } else {
      await this.assertClientAccess(projectRequestId, user);
    }

    return this.prisma.projectAttachment.create({
      data: {
        projectRequestId,
        title: dto.title.trim(),
        url: dto.url.trim(),
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async update(
    attachmentId: string,
    dto: { title?: string; url?: string },
    user: User,
  ) {
    const existing = await this.prisma.projectAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!existing) {
      throw new NotFoundException('Attachment not found');
    }

    if (!this.canManage(user)) {
      // Clients may only manage the rows they added themselves.
      if (existing.createdById !== user.id) {
        throw new ForbiddenException('Access denied');
      }
      await this.assertClientAccess(existing.projectRequestId, user);
    }

    return this.prisma.projectAttachment.update({
      where: { id: attachmentId },
      data: {
        title: dto.title?.trim() || undefined,
        url: dto.url?.trim() || undefined,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async remove(attachmentId: string, user: User) {
    const existing = await this.prisma.projectAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!existing) {
      throw new NotFoundException('Attachment not found');
    }

    if (!this.canManage(user)) {
      if (existing.createdById !== user.id) {
        throw new ForbiddenException('Access denied');
      }
      await this.assertClientAccess(existing.projectRequestId, user);
    }

    await this.prisma.projectAttachment.delete({ where: { id: attachmentId } });

    return { success: true, message: 'Attachment deleted successfully' };
  }
}
