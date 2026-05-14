import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getNotifications(@CurrentUser() user: client.User) {
    const notifications = await this.notificationService.getNotifications(user.id);
    const unreadCount = await this.notificationService.getUnreadCount(user.id);
    return {
      success: true,
      data: notifications,
      unreadCount,
    };
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: client.User) {
    const count = await this.notificationService.getUnreadCount(user.id);
    return { success: true, count };
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    await this.notificationService.markAsRead(id, user.id);
    return { success: true, message: 'Notification marked as read' };
  }

  @Patch('mark-all-read')
  async markAllAsRead(@CurrentUser() user: client.User) {
    await this.notificationService.markAllAsRead(user.id);
    return { success: true, message: 'All notifications marked as read' };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deleteNotification(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    await this.notificationService.deleteNotification(id, user.id);
    return { success: true, message: 'Notification deleted' };
  }

  // Accept a project request from notification
  @Post(':id/accept-project')
  @HttpCode(HttpStatus.OK)
  async acceptProject(
    @Param('id') notificationId: string,
    @CurrentUser() user: client.User,
  ) {
    // Find the notification
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.projectRequestId) {
      throw new BadRequestException('No project request linked to this notification');
    }

    // Update project request to approved
    const projectRequest = await this.prisma.projectRequest.findUnique({
      where: { id: notification.projectRequestId },
    });

    if (!projectRequest) {
      throw new NotFoundException('Project request not found');
    }

    if (projectRequest.isApproved) {
      throw new BadRequestException('Project request already approved');
    }

    await this.prisma.projectRequest.update({
      where: { id: notification.projectRequestId },
      data: { isApproved: true },
    });

    // Mark notification as read
    await this.notificationService.markAsRead(notificationId, user.id);

    // Mark all notifications with the same projectRequestId as read for all users
    await this.prisma.notification.updateMany({
      where: {
        projectRequestId: notification.projectRequestId,
        type: 'NEW_PROJECT_REQUEST',
      },
      data: { isRead: true },
    });

    return {
      success: true,
      message: 'Project request accepted and moved to inquiry',
    };
  }

  // Reject a project request from notification
  @Post(':id/reject-project')
  @HttpCode(HttpStatus.OK)
  async rejectProject(
    @Param('id') notificationId: string,
    @CurrentUser() user: client.User,
  ) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId: user.id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.projectRequestId) {
      throw new BadRequestException('No project request linked to this notification');
    }

    // Soft-delete or cancel the project request
    await this.prisma.projectRequest.update({
      where: { id: notification.projectRequestId },
      data: { deletedAt: new Date() },
    });

    // Mark notification as read
    await this.notificationService.markAsRead(notificationId, user.id);

    // Mark all notifications with the same projectRequestId as read
    await this.prisma.notification.updateMany({
      where: {
        projectRequestId: notification.projectRequestId,
        type: 'NEW_PROJECT_REQUEST',
      },
      data: { isRead: true },
    });

    return {
      success: true,
      message: 'Project request rejected',
    };
  }
}
