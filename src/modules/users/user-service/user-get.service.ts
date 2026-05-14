import { Injectable, NotFoundException } from '@nestjs/common';
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
    employeeProfile: true,
    // NEVER include: password, refreshToken, googleId, etc.
  } satisfies Prisma.UserSelect);


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
  async findByRole(role: UserRole): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      where: { role },
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
   * Get all client (USER role) users with full details:
   * projects, phases, payments, bank info
   */
  async getClientUsersWithDetails() {
    const users = await this.prisma.user.findMany({
      where: { role: 'USER' },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
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
            proposals: {
              select: {
                id: true,
                paymentMethod: true,
                paymentType: true,
                totalAmount: true,
                status: true,
                services: {
                  select: { id: true, name: true, amount: true, order: true },
                  orderBy: { order: 'asc' },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
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

      // Calculate total owed from proposals
      let totalOwed = 0;
      for (const pr of user.projectRequests) {
        const proposal = pr.proposals?.[0];
        if (proposal) {
          totalOwed += Number(proposal.totalAmount || 0);
        }
      }

      // Get phone from first project request
      const phone = user.projectRequests?.[0]?.phone || null;

      // Currently running phases
      const runningProjects = user.projectRequests.filter(pr =>
        pr.stages.some(s => s.status === 'IN_PROGRESS'),
      );
      const runningPhases = user.projectRequests.flatMap(pr =>
        pr.stages.filter(s => s.status === 'IN_PROGRESS').map(s => ({
          projectName: pr.projectName,
          phaseName: s.name,
          progress: s.progress,
        })),
      );

      return {
        ...user,
        phone,
        totalPaid,
        totalOwed,
        leftToPay: Math.max(0, totalOwed - totalPaid),
        projectCount: user.projectRequests.length,
        runningProjectCount: runningProjects.length,
        runningPhases,
      };
    });
  }
}
