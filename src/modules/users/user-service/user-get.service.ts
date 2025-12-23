import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, User, UserRole } from "@prisma/client";
import { FindAllOptions } from "src/modules/auth/constant";
import { PrismaService } from "src/prisma/prisma.service";
import { SafeUser } from "../types/user.type";

@Injectable()
export class UsersGetService {
  constructor(private prisma: PrismaService) {}

  private readonly baseSelect = Prisma.validator<Prisma.UserSelect>()({
    id: true,
    email: true,
    name: true,
    role: true,
    avatar: true,
    createdAt: true,
    lastLoginAt: true,
    emailVerified: true,
    // NEVER include: password, refreshToken, googleId, etc.
  } satisfies Prisma.UserSelect);

  /**
   * Get list of users with pagination, filtering, search and cursor-based support
   */
  async listUsers({
    page,
    take,
    roleFilter,
    search,
    cursor,
  }: FindAllOptions) {
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
          nextCursor: users.length === limit ? users[users.length - 1].id : null,
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

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.baseSelect,
    });

    if (!user) throw new NotFoundException('User not found');

    return user as User;
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
}