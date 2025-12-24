// media.repository.ts
import { Injectable } from '@nestjs/common';

import { MediaContentType, MediaStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class MediaRepository {
  constructor(private prisma: PrismaService) {}

  async findBySlugWithRelations(slug: string) {
    return this.prisma.mediaContent.findUnique({
      where: { slug },
      include: {
        assets: true,
        tags: { include: { tag: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
  }


}