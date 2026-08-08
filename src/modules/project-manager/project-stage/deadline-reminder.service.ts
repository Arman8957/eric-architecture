import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationService } from 'src/modules/notification/notification.service';
import { staffProjectLink } from 'src/common/notification-links';

@Injectable()
export class DeadlineReminderService {
  private readonly logger = new Logger(DeadlineReminderService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Generate reminder records for a stage deadline.
   * Called when a deadline is set or changed.
   */
  async generateReminders(
    stageId: string,
    deadlineType: 'INTERNAL' | 'EXTERNAL',
    deadlineDate: Date,
    targetUserId: string,
  ) {
    // First cancel any existing unsent reminders for this stage + type
    await this.cancelRemindersForStageType(stageId, deadlineType);

    const now = new Date();
    const intervals = [7, 3, 1];

    for (const daysBefore of intervals) {
      const reminderDate = new Date(deadlineDate);
      reminderDate.setDate(reminderDate.getDate() - daysBefore);

      // Only create if the reminder date is in the future
      if (reminderDate > now) {
        await this.prisma.deadlineReminder.create({
          data: {
            stageId,
            deadlineType,
            deadlineDate,
            reminderDate,
            daysBefore,
            targetUserId,
          },
        });

        this.logger.log(
          `Created ${deadlineType} reminder for stage ${stageId}: ${daysBefore} day(s) before ${deadlineDate.toISOString()}`,
        );
      }
    }
  }

  /**
   * Cancel all unsent reminders for a stage + deadline type.
   * Called when deadline changes or item is completed.
   */
  async cancelRemindersForStageType(
    stageId: string,
    deadlineType: string,
  ) {
    const result = await this.prisma.deadlineReminder.updateMany({
      where: {
        stageId,
        deadlineType,
        sentAt: null,
        cancelled: false,
      },
      data: {
        cancelled: true,
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cancelled ${result.count} ${deadlineType} reminder(s) for stage ${stageId}`,
      );
    }
  }

  /**
   * Cancel ALL unsent reminders for a stage (both types).
   * Called when stage is marked as completed.
   */
  async cancelAllRemindersForStage(stageId: string) {
    const result = await this.prisma.deadlineReminder.updateMany({
      where: {
        stageId,
        sentAt: null,
        cancelled: false,
      },
      data: {
        cancelled: true,
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cancelled ${result.count} reminder(s) for completed stage ${stageId}`,
      );
    }
  }

  /**
   * Cron job: Runs every hour to check and send due reminders.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processReminders() {
    const now = new Date();

    const dueReminders = await this.prisma.deadlineReminder.findMany({
      where: {
        reminderDate: { lte: now },
        sentAt: null,
        cancelled: false,
      },
      include: {
        stage: {
          include: {
            proposal: {
              include: {
                projectRequest: true,
              },
            },
          },
        },
      },
    });

    if (dueReminders.length === 0) return;

    this.logger.log(`Processing ${dueReminders.length} due deadline reminders`);

    for (const reminder of dueReminders) {
      try {
        // Skip if stage was completed in the meantime
        if (reminder.stage.status === 'COMPLETED') {
          await this.prisma.deadlineReminder.update({
            where: { id: reminder.id },
            data: { cancelled: true },
          });
          continue;
        }

        const projectName =
          reminder.stage.proposal?.projectRequest?.projectName ||
          reminder.stage.proposal?.projectName ||
          'Unknown Project';

        const deadlineDateStr = reminder.deadlineDate.toLocaleDateString(
          'en-US',
          {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          },
        );

        const typeLabel =
          reminder.deadlineType === 'INTERNAL'
            ? 'Internal Deadline'
            : 'External Deadline';

        const title = `${typeLabel} Reminder: ${reminder.stage.name}`;
        const message = `The ${typeLabel.toLowerCase()} for phase "${reminder.stage.name}" in project "${projectName}" is due on ${deadlineDateStr} (${reminder.daysBefore} day${reminder.daysBefore > 1 ? 's' : ''} remaining).`;

        await this.notificationService.createNotification({
          userId: reminder.targetUserId,
          type: 'DEADLINE_REMINDER',
          title,
          message,
          link: staffProjectLink(
            reminder.stage.proposal?.projectRequest?.id || '',
            'management',
          ),
          projectRequestId:
            reminder.stage.proposal?.projectRequest?.id || undefined,
        });

        // Mark as sent
        await this.prisma.deadlineReminder.update({
          where: { id: reminder.id },
          data: { sentAt: new Date() },
        });

        this.logger.log(
          `Sent ${reminder.deadlineType} reminder for stage "${reminder.stage.name}" to user ${reminder.targetUserId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to process reminder ${reminder.id}`,
          error,
        );
      }
    }
  }
}
