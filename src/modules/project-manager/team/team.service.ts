import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { User, UserRole } from '@prisma/client';

@Injectable()
export class TeamService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTeamDto, user: User) {
    if (user.role !== UserRole.PROJECT_MANAGER && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only project managers or admins can create teams');
    }

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        createdById: user.id,
        members: {
          connect: dto.memberIds?.map(id => ({ id })) || [],
        },
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    return team;
  }

  async findAll(user: User) {
    let where: any = {};
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      where = {};
    } else if (user.role === UserRole.PROJECT_MANAGER) {
      where = { createdById: user.id };
    } else {
      // Staff roles: see teams you are a member of
      where = { members: { some: { id: user.id } } };
    }

    return this.prisma.team.findMany({
      where,
      include: {
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
        _count: {
          select: { projects: true },
        },
      },
    });
  }

  async findOne(id: string, user: User) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const isMember = team.members.some(m => m.id === user.id);
    const isCreator = team.createdById === user.id;
    const isAdmin = user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN;

    if (!isAdmin && !isCreator && !isMember) {
      throw new ForbiddenException('Access denied');
    }

    return team;
  }

  async update(id: string, dto: UpdateTeamDto, user: User) {
    const team = await this.findOne(id, user);

    return this.prisma.team.update({
      where: { id },
      data: {
        name: dto.name,
        members: dto.memberIds ? {
          set: dto.memberIds.map(id => ({ id })),
        } : undefined,
      },
      include: {
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: true,
          },
        },
      },
    });
  }

  async remove(id: string, user: User) {
    await this.findOne(id, user);
    await this.prisma.team.delete({ where: { id } });
    return { success: true, message: 'Team deleted successfully' };
  }

  async getAssignableMembers() {
    return this.prisma.user.findMany({
      where: {
        role: {
          in: [UserRole.DRAFTER, UserRole.EMPLOYEE],
        },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        role: true,
      },
    });
  }
}
