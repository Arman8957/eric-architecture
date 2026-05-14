import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private notificationGateway: NotificationGateway,
  ) {}

  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    projectRequestId?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        link: data.link || null,
        projectRequestId: data.projectRequestId || null,
      },
    });

    // Emit real-time notification via WebSocket
    this.notificationGateway.sendNotificationToUser(data.userId, notification);

    return notification;
  }

  async createNotificationsForAdminsAndPMs(data: {
    type: string;
    title: string;
    message: string;
    link?: string;
    projectRequestId?: string;
  }) {
    // Find all SUPER_ADMIN and PROJECT_MANAGER users
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: ['SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER'] },
        isActive: true,
      },
      select: { id: true },
    });

    const notifications = await Promise.all(
      users.map((user) =>
        this.createNotification({
          userId: user.id,
          ...data,
        }),
      ),
    );

    return notifications;
  }

  async getNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(id: string, userId: string) {
    return this.prisma.notification.deleteMany({
      where: { id, userId },
    });
  }
}
