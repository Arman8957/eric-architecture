import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, User, UserRole } from '@prisma/client';
import { FindAllOptions } from 'src/modules/auth/constant';
import { PrismaService } from 'src/prisma/prisma.service';
import { SafeUser } from '../types/user.type';

@Injectable()
export class UsersGetService {
  constructor(private prisma: PrismaService) {}

  private readonly baseSelect = Prisma.validator<Prisma.UserSelect>()({
    id: true,
    email: true,
    name: true,
    role: true,
    avatar: true,
    isActive: true,
    createdAt: true,
    lastLoginAt: true,
    emailVerified: true,
    employeeProfile: { include: { taxes: true } },
    // Profile fields — safe to expose to the owning user and staff.
    firstName: true,
    middleInitial: true,
    lastName: true,
    phoneNumber: true,
    companyName: true,
    bio: true,
    streetAddress: true,
    city: true,
    stateRegion: true,
    zipCode: true,
    country: true,
    emailNotifications: true,
    projectUpdates: true,
    securityAlerts: true,
    // NEVER include: password, refreshToken, googleId, etc.
  } satisfies Prisma.UserSelect);

  /**
   * Self-service profile update. Any authenticated user may edit their own
   * record — this is deliberately not the admin `update(id, dto)` path, which
   * requires a UUID param and elevated role.
   */
  async updateOwnProfile(
    userId: string,
    dto: Record<string, string | undefined>,
    avatarUrl?: string,
  ) {
    const editable = [
      'name',
      'firstName',
      'middleInitial',
      'lastName',
      'phoneNumber',
      'companyName',
      'bio',
      'streetAddress',
      'city',
      'stateRegion',
      'zipCode',
      'country',
    ] as const;

    const data: Prisma.UserUpdateInput = {};
    for (const key of editable) {
      const value = dto[key];
      // An omitted field is left alone; an explicitly blank one is cleared.
      if (value !== undefined) {
        (data as Record<string, unknown>)[key] = value.trim() || null;
      }
    }

    if (avatarUrl) {
      data.avatar = avatarUrl;
    }

    // Keep the display name in step with the parts when they are supplied.
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const existing = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const first = dto.firstName ?? existing?.firstName ?? '';
      const last = dto.lastName ?? existing?.lastName ?? '';
      const combined = [first, last].filter(Boolean).join(' ').trim();
      if (combined) data.name = combined;
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: this.baseSelect,
    });

    return user;
  }

  async updateNotificationPreferences(
    userId: string,
    prefs: Record<string, string | boolean | undefined>,
  ) {
    const toBool = (v: string | boolean | undefined) =>
      typeof v === 'boolean' ? v : v === 'true';

    const data: Prisma.UserUpdateInput = {};
    for (const key of [
      'emailNotifications',
      'projectUpdates',
      'securityAlerts',
    ] as const) {
      if (prefs[key] !== undefined) {
        (data as Record<string, unknown>)[key] = toBool(prefs[key]);
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: this.baseSelect,
    });
  }


  async listUsers({ page, take, roleFilter, search, cursor }: FindAllOptions) {
    // Sanitize inputs
    const pageNum = Math.max(1, page);
    const limit = Math.min(100, Math.max(1, take)); // Prevent abuse

    const where: Prisma.UserWhereInput = {
      ...(roleFilter && { role: roleFilter }),
      ...(search && {
        OR: [
          { email: { contains: search.trim(), mode: 'insensitive' } },
          { name: { contains: search.trim(), mode: 'insensitive' } },
        ],
      }),
    };

    if (cursor) {
      // Cursor-based pagination
      const users = await this.prisma.user.findMany({
        where,
        take: limit,
        skip: 1, // Skip the cursor itself
        cursor: { id: cursor },
        orderBy: { createdAt: 'desc' },
        select: this.baseSelect,
      });

      const total = await this.prisma.user.count({ where });

      return {
        data: users,
        meta: {
          total,
          nextCursor:
            users.length === limit ? users[users.length - 1].id : null,
          hasMore: users.length === limit,
        },
      };
    }

    // Offset-based pagination (default)
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (pageNum - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: this.baseSelect,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page: pageNum,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.baseSelect,
    });

    if (!user) throw new NotFoundException('User not found');

    return user as unknown as SafeUser;
  }
  async findByRole(role: UserRole | UserRole[]): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      where: { role: Array.isArray(role) ? { in: role } : role },
      select: this.baseSelect,
      orderBy: { name: 'asc' },
    }) as Promise<SafeUser[]>;
  }

  async getSafeUser(id: string) {
    return this.findById(id);
  }

  getPublicUser(user: Pick<User, 'id' | 'name' | 'role' | 'avatar'>) {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
    };
  }

  async update(id: string, data: Prisma.UserUpdateInput) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id },
      data,
      select: this.baseSelect,
    });
  }

  async delete(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.delete({ where: { id } });
    return { success: true, message: 'User deleted successfully' };
  }

  /**
   * Delete a team member, gated on the acting admin re-entering their own
   * password.
   *
   * Most of the User relations (proposals, refunds, project requests) are not
   * cascading, so a hard delete on anyone with history fails at the database
   * level. Those accounts are deactivated instead, which preserves the audit
   * trail and stops them logging in.
   */
  async deleteWithPasswordConfirmation(
    id: string,
    actorId: string,
    password?: string,
  ) {
    if (!password?.trim())
      throw new BadRequestException('Enter your password to confirm');

    if (id === actorId)
      throw new BadRequestException('You cannot delete your own account');

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { password: true },
    });
    if (!actor?.password)
      throw new ForbiddenException('Your account has no password set');

    const matches = await bcrypt.compare(password, actor.password);
    if (!matches) throw new ForbiddenException('Incorrect password');

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // A project manager's projects must not disappear with them. Hand them back
    // to the owner (super admin) for reassignment, and detach — never delete —
    // their timecards so the hours they accrued stay on record against them
    // rather than being absorbed into the owner's totals.
    const reassignedTo = await this.prisma.user.findFirst({
      where: { role: UserRole.SUPER_ADMIN, isActive: true, id: { not: id } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const releasedProjects = await this.prisma.projectRequest.count({
      where: { assignedManagerId: id },
    });

    if (releasedProjects > 0) {
      await this.prisma.projectRequest.updateMany({
        where: { assignedManagerId: id },
        // Null when there is no super admin to hand them to — the project
        // simply shows as Unassigned rather than blocking the deletion.
        data: { assignedManagerId: reassignedTo?.id ?? null },
      });
    }

    // Phases assigned to them are released the same way.
    await this.prisma.projectStage.updateMany({
      where: { assignedToId: id },
      data: { assignedToId: null },
    });

    // A client's projects and signed contracts must outlive them. The studio
    // history and every financial report are built from the project / proposal
    // / payment rows, never from the client account — and the project already
    // stores the client's name, email and address as its own columns, so
    // detaching loses nothing from the reports. (The FK is SET NULL on a hard
    // delete anyway; doing it up front makes the deactivation fallback below
    // behave identically.)
    const isClient = user.role === UserRole.USER;
    let detachedProjects = 0;
    if (isClient) {
      detachedProjects = await this.prisma.projectRequest.count({
        where: { userId: id },
      });
      await this.prisma.projectRequest.updateMany({
        where: { userId: id },
        data: { userId: null },
      });
      await this.prisma.proposal.updateMany({
        where: { userId: id },
        data: { userId: null },
      });
    }

    try {
      await this.prisma.user.delete({ where: { id } });
      return {
        success: true,
        message: isClient
          ? detachedProjects
            ? `Client deleted. ${detachedProjects} project${detachedProjects === 1 ? '' : 's'} and all financial records were kept.`
            : 'Client deleted.'
          : releasedProjects
            ? `Team member deleted. ${releasedProjects} project${releasedProjects === 1 ? '' : 's'} released for reassignment.`
            : 'Team member deleted',
        deactivated: false,
        releasedProjects,
        detachedProjects,
      };
    } catch (error) {
      const isForeignKeyBlock =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003';
      if (!isForeignKeyBlock) throw error;

      // Payment / refund / meeting rows carry a non-nullable link back to the
      // user, so a hard delete is impossible. Anonymise the account instead:
      // it drops out of the Client Directory, frees the email for reuse, and
      // can no longer be logged into — while the rows that reference it (and
      // therefore every financial total) stay exactly as they were.
      if (isClient) {
        await this.prisma.userBankDetails.deleteMany({ where: { userId: id } });
        await this.prisma.user.update({
          where: { id },
          data: {
            isActive: false,
            email: `deleted-${id}@deleted.invalid`,
            name: 'Deleted Client',
            firstName: null,
            lastName: null,
            middleInitial: null,
            phoneNumber: null,
            companyName: null,
            bio: null,
            avatar: null,
            googleId: null,
            streetAddress: null,
            aptSuiteUnit: null,
            city: null,
            stateRegion: null,
            zipCode: null,
            country: null,
            password: null,
            refreshToken: null,
            emailVerifyToken: null,
            passwordResetToken: null,
          },
        });
        return {
          success: true,
          message:
            'Client removed. They had payment or meeting history, so the account was anonymised and deactivated instead of hard-deleted — their projects and every financial record stay intact.',
          deactivated: true,
          detachedProjects,
        };
      }

      await this.prisma.user.update({
        where: { id },
        data: { isActive: false },
      });
      return {
        success: true,
        message:
          'This member still has records that reference them (timecards, proposals), so their account was deactivated instead of deleted. Their hours stay on their own record.',
        deactivated: true,
      };
    }
  }

  /**
   * Get all client (USER role) users with full details:
   * projects, phases, payments, bank info
   */
  async getClientUsersWithDetails() {
    const users = await this.prisma.user.findMany({
      // Deleted clients are deactivated + anonymised, never truly removed when
      // they have payment history — keep them out of the directory.
      where: { role: 'USER', isActive: true },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        // Profile detail for the "View Client Details" card
        firstName: true,
        middleInitial: true,
        lastName: true,
        phoneNumber: true,
        companyName: true,
        bio: true,
        streetAddress: true,
        city: true,
        stateRegion: true,
        zipCode: true,
        country: true,
        bankDetails: true,
        projectRequests: {
          select: {
            id: true,
            projectName: true,
            status: true,
            email: true,
            phone: true,
            stages: {
              select: {
                id: true,
                name: true,
                status: true,
                progress: true,
                order: true,
              },
              orderBy: { order: 'asc' },
            },
            // Every signed contract counts toward the balance - the original
            // and each accepted amendment - not just the newest one.
            proposals: {
              where: { status: 'ACCEPTED' },
              select: {
                id: true,
                proposalNumber: true,
                proposalType: true,
                paymentMethod: true,
                paymentType: true,
                totalAmount: true,
                status: true,
                services: {
                  select: { id: true, name: true, amount: true, order: true },
                  orderBy: { order: 'asc' },
                },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        payments: {
          select: {
            id: true,
            amount: true,
            paymentType: true,
            paymentStatus: true,
            stageName: true,
            createdAt: true,
            projectRequestId: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        assignedProjects: {
          select: { id: true, projectName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Compute financial summaries per user
    return users.map(user => {
      const completedPayments = user.payments.filter(p => p.paymentStatus === 'COMPLETED');
      const totalPaid = completedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      // Total contracted across EVERY signed contract on every project
      // (originals plus accepted amendments).
      const totalOwed = user.projectRequests.reduce(
        (sum, pr) =>
          sum +
          pr.proposals.reduce((s, p) => s + Number(p.totalAmount || 0), 0),
        0,
      );

      // Get phone from the profile, falling back to the first project request
      const phone = user.phoneNumber || user.projectRequests?.[0]?.phone || null;

      // Work is tracked per project, not per phase.
      const runningProjects = user.projectRequests
        .filter((pr) => pr.stages.some((s) => s.status === 'IN_PROGRESS'))
        .map((pr) => {
          const completed = pr.stages.filter((s) => s.status === 'COMPLETED').length;
          const total = pr.stages.length;
          return {
            id: pr.id,
            projectName: pr.projectName,
            status: pr.status,
            completedPhases: completed,
            totalPhases: total,
            progress: total > 0 ? Math.round((completed / total) * 100) : 0,
            // The phase currently being worked, for context.
            currentPhase:
              pr.stages.find((s) => s.status === 'IN_PROGRESS')?.name || null,
          };
        });

      return {
        ...user,
        phone,
        totalPaid,
        totalOwed,
        // Balance = everything contracted across signed contracts, less what
        // has actually been paid.
        leftToPay: Math.max(0, totalOwed - totalPaid),
        projectCount: user.projectRequests.length,
        runningProjectCount: runningProjects.length,
        runningProjects,
      };
    });
  }
}
