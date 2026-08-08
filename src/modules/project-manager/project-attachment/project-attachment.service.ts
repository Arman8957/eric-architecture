import {
  Injectable,
  NotFoundException,
  ForbiddenException,
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

  private async assertCanRead(projectRequestId: string, user: User) {
    if (this.canManage(user)) return;

    const project = await this.prisma.projectRequest.findUnique({
      where: { id: projectRequestId },
      select: { userId: true },
    });

    if (!project || project.userId !== user.id) {
      throw new ForbiddenException('Access denied');
    }
  }

  async getForProject(projectRequestId: string, user: User) {
    await this.assertCanRead(projectRequestId, user);

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
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    if (!dto.title?.trim() || !dto.url?.trim()) {
      throw new ForbiddenException('Title and URL are required');
    }

    const project = await this.prisma.projectRequest.findUnique({
      where: { id: projectRequestId },
    });

    if (!project) {
      throw new NotFoundException('Project request not found');
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
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const existing = await this.prisma.projectAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!existing) {
      throw new NotFoundException('Attachment not found');
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
    if (!this.canManage(user)) {
      throw new ForbiddenException('Access denied');
    }

    const existing = await this.prisma.projectAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!existing) {
      throw new NotFoundException('Attachment not found');
    }

    await this.prisma.projectAttachment.delete({ where: { id: attachmentId } });

    return { success: true, message: 'Attachment deleted successfully' };
  }
}
