import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import {
  MediaContentType,
  MediaStatus,
  UserRole,
  AssetType,
  ProjectCategory,
} from '@prisma/client';
import slugify from 'slugify';
import { PrismaService } from 'src/prisma/prisma.service';
import { CloudinaryStrategy } from 'src/upload/strategies/cloudinary.strategy';
import {
  CreateMediaCommentDto,
  CreateMediaContentDto,
} from './dto/create-media-content.dto';
import { UpdateMediaContentDto } from './dto/update-media-content.dto';

@Injectable()
export class MediaService {
  private readonly allowedMediaRoles = new Set<UserRole>([
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MEDIA_MANAGER,
  ]);

  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryStrategy,
  ) { }

  async create(dto: CreateMediaContentDto, userId: string, userRole: UserRole) {
    if (!this.allowedMediaRoles.has(userRole)) {
      throw new ForbiddenException('Not authorized to create media content');
    }

    let slug = dto.slug || slugify(dto.title, { lower: true, strict: true });

    // Ensure unique slug
    let counter = 1;
    let baseSlug = slug;
    while (await this.prisma.mediaContent.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    return this.prisma.mediaContent.create({
      data: {
        ...dto,
        slug,
        createdById: userId,
        status: MediaStatus.DRAFT,
        coordinates: dto.coordinates
          ? JSON.stringify(dto.coordinates)
          : undefined,
      },
    });
  }

  async addAssets(
    mediaId: string,
    files: Express.Multer.File[],
    uploadedById: string,
    userRole: UserRole,
  ) {
    const media = await this.prisma.mediaContent.findUnique({
      where: { id: mediaId },
      include: { assets: true },
    });

    if (!media) throw new NotFoundException('Media not found');

    if (
      !this.allowedMediaRoles.has(userRole) &&
      media.createdById !== uploadedById
    ) {
      throw new ForbiddenException(
        'Not authorized to add assets to this content',
      );
    }

    const folder = `architecture-simple/media/${media.contentType.toLowerCase()}/${media.slug || media.id}`;

    const uploadedAssets = await Promise.all(
      files.map(async (file) => {
        const result = await this.cloudinary.upload(file, folder);

        const assetType = this.determineAssetType(file.mimetype);

        return this.prisma.mediaAsset.create({
          data: {
            mediaContentId: mediaId,
            uploadedById,
            type: assetType,
            title: file.originalname,
            originalUrl: result.url,
            cdnUrl: result.url,
            fileSize: result.size,
            mimeType: file.mimetype,
            width: result.width,
            height: result.height,
            format: result.format,
            // You can add blurHash generation later
          },
        });
      }),
    );

    // Auto set cover image if none exists and we have images
    if (!media.coverImage) {
      const firstImage = uploadedAssets.find(
        (a) => a.type === AssetType.IMAGE_2D,
      );
      if (firstImage) {
        await this.prisma.mediaContent.update({
          where: { id: mediaId },
          data: { coverImage: firstImage.cdnUrl },
        });
      }
    }

    return {
      message: 'Assets uploaded successfully',
      count: uploadedAssets.length,
      assets: uploadedAssets,
    };
  }

  async update(
    id: string,
    dto: UpdateMediaContentDto,
    userId: string,
    userRole: UserRole,
  ) {
    const media = await this.prisma.mediaContent.findUnique({ where: { id } });

    if (!media) throw new NotFoundException('Media not found');

    if (!this.allowedMediaRoles.has(userRole) && media.createdById !== userId) {
      throw new ForbiddenException('Not authorized to update this content');
    }

    return this.prisma.mediaContent.update({
      where: { id },
      data: {
        ...dto,
        coordinates:
          dto.coordinates !== undefined
            ? JSON.stringify(dto.coordinates)
            : undefined,
      },
    });
  }

  async delete(id: string, userId: string, userRole: UserRole) {
    const media = await this.prisma.mediaContent.findUnique({
      where: { id },
      include: { assets: { select: { cdnUrl: true } } },
    });

    if (!media) throw new NotFoundException();

    if (
      !this.allowedMediaRoles.has(userRole) && // ← FIXED HERE
      media.createdById !== userId
    ) {
      throw new ForbiddenException('Not authorized to delete');
    }

    // Delete Cloudinary files
    const publicIds = media.assets
      .map((asset) => {
        const parts = asset.cdnUrl.split('/');
        const filename = parts[parts.length - 1];
        return filename.split('.')[0];
      })
      .filter(Boolean);

    if (publicIds.length > 0) {
      await this.cloudinary.deleteMultiple(publicIds);
    }

    await this.prisma.mediaContent.delete({ where: { id } });

    return {
      message: 'Media content and associated assets deleted successfully',
    };
  }

  async findAll(
    query: {
      type?: MediaContentType;
      status?: MediaStatus;
      featured?: boolean;
      country?: string;
      category?: ProjectCategory;
      page?: number;
      limit?: number;
    },
    currentUser?: { id: string }, // you can later add role if needed
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 12), 50);
    const skip = (page - 1) * limit;

    const where: any = {};
    const where: any = {};

    // ────────────────────────────────
    // STATUS FILTERING – YOUR NEW REQUIREMENT
    // ────────────────────────────────
    if (query.status !== undefined) {
      // If user explicitly sends ?status=XXX → use exactly that value
      where.status = query.status;
    }

    // Other filters (unchanged)
    if (query.type) where.contentType = query.type;
    if (query.featured !== undefined) where.isFeatured = query.featured;
    if (query.country) {
      where.country = { contains: query.country, mode: 'insensitive' };
    }
    if (query.category) where.category = query.category;

    // ────────────────────────────────
    // Queries in parallel
    // ────────────────────────────────
    const [items, total] = await Promise.all([
      this.prisma.mediaContent.findMany({
        where,
        include: {
          assets: {
            orderBy: { order: 'asc' },
            take: 6,
            select: {
              id: true,
              type: true,
              cdnUrl: true,
              width: true,
              height: true,
            },
          },
          tags: {
            include: { tag: { select: { name: true, slug: true } } },
          },
        },
        skip,
        take: limit,
        orderBy: [
          query.featured ? { featuredOrder: 'asc' } : {},
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.mediaContent.count({ where }),
    ]);

    // Likes logic (unchanged)
    const userLikesSet = new Set<string>();
    if (currentUser?.id) {
      const likes = await this.prisma.mediaLike.findMany({
        where: { userId: currentUser.id },
        select: { mediaContentId: true },
      });
      likes.forEach((l) => userLikesSet.add(l.mediaContentId));
    }

    const data = items.map((item) => ({
      ...item,
      likeCount: item.likeCount ?? 0,
      commentCount: item.commentCount ?? 0,
      userHasLiked: currentUser?.id ? userLikesSet.has(item.id) : false,
    }));
    const data = items.map((item) => ({
      ...item,
      likeCount: item.likeCount ?? 0,
      commentCount: item.commentCount ?? 0,
      userHasLiked: currentUser?.id ? userLikesSet.has(item.id) : false,
    }));

    return {
      status: 'success',
      data,
      pagination: {
        total,
        page,
        limit,
        pages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }
    return {
  status: 'success',
  data,
  pagination: {
    total,
    page,
    limit,
    pages: total > 0 ? Math.ceil(total / limit) : 0,
  },
};
  }

  // In MediaService - findBySlug
  async findBySlug(slug: string, incrementView = true, currentUserId ?: string) {
  const item = await this.prisma.mediaContent.findUnique({
    where: { slug },
    include: {
      assets: { orderBy: { order: 'asc' } },
      tags: { include: { tag: true } },
      createdBy: { select: { id: true, name: true, avatar: true } },
    },
  });

  if (!item) throw new NotFoundException('Content not found');
  if (item.status !== MediaStatus.PUBLISHED) {
    throw new BadRequestException('Content is not published');
  }

  if (incrementView) {
    await this.prisma.mediaContent.update({
      where: { id: item.id },
      data: { viewCount: { increment: 1 } },
    });
  }

  // Enrich with user interaction data
  const [likeCount, commentCount, userHasLiked] = await Promise.all([
    Promise.resolve(item.likeCount ?? 0),
    Promise.resolve(item.commentCount ?? 0),
    currentUserId
      ? this.prisma.mediaLike.count({
        where: { userId: currentUserId, mediaContentId: item.id },
      })
      : Promise.resolve(0),
  ]);

  return {
    ...item,
    likeCount,
    commentCount,
    userHasLiked: !!userHasLiked,
  };
}

  async getFeatured(limit = 6) {
  return this.prisma.mediaContent.findMany({
    where: {
      isFeatured: true,
      status: MediaStatus.PUBLISHED,
    },
    orderBy: { featuredOrder: 'asc' },
    take: limit,
    include: {
      assets: { take: 3 },
    },
  });
}

  private determineAssetType(mimeType: string): AssetType {
  if (mimeType.startsWith('image/')) return AssetType.IMAGE_2D;
  if (mimeType.startsWith('video/')) return AssetType.VIDEO;
  if (mimeType.includes('pdf')) return AssetType.DOCUMENT_1D;
  return AssetType.IMAGE_2D; // fallback
}

  //================comment and like =================

  async toggleMediaLike(mediaId: string, userId: string) {
  return this.prisma.$transaction(async (tx) => {
    const media = await tx.mediaContent.findUnique({
      where: { id: mediaId },
      select: { id: true, status: true },
    });

    if (!media) throw new NotFoundException('Media not found');
    if (media.status !== MediaStatus.PUBLISHED) {
      throw new BadRequestException(
        'Cannot interact with unpublished content',
      );
    }

    const existingLike = await tx.mediaLike.findUnique({
      where: {
        userId_mediaContentId: { userId, mediaContentId: mediaId },
      },
    });

    if (existingLike) {
      // Unlike
      await tx.mediaLike.delete({ where: { id: existingLike.id } });

      await tx.mediaContent.update({
        where: { id: mediaId },
        data: { likeCount: { decrement: 1 } },
      });

      return { liked: false };
    }

    // Like
    await tx.mediaLike.create({
      data: { userId, mediaContentId: mediaId },
    });

    await tx.mediaContent.update({
      where: { id: mediaId },
      data: { likeCount: { increment: 1 } },
    });

    return { liked: true };
  });
}

  async getMediaLikesInfo(mediaId: string, userId ?: string) {
  const [likeCount, userLiked] = await Promise.all([
    this.prisma.mediaContent
      .findUnique({ where: { id: mediaId }, select: { likeCount: true } })
      .then((r) => r?.likeCount ?? 0),

    userId
      ? this.prisma.mediaLike.count({
        where: { userId, mediaContentId: mediaId },
      })
      : 0,
  ]);

  return {
    likeCount,
    userHasLiked: !!userLiked,
  };
}

  //=========================extras

  async findAllPublic(
  query: {
  type?: MediaContentType;
  featured?: boolean;
  country?: string;
  category?: ProjectCategory;
  page?: number;
  limit?: number;
},
  userId ?: string,
) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(Math.max(1, query.limit ?? 12), 50);
  const skip = (page - 1) * limit;
  query: {
    type ?: MediaContentType;
    featured ?: boolean;
    country ?: string;
    category ?: ProjectCategory;
    page ?: number;
    limit ?: number;
  },
  userId ?: string,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 12), 50);
    const skip = (page - 1) * limit;

    const where: any = {
      status: MediaStatus.PUBLISHED, // ← fixed for public
    };
    const where: any = {
      status: MediaStatus.PUBLISHED, // ← fixed for public
    };

    if (query.type) where.contentType = query.type;
    if (query.featured !== undefined) where.isFeatured = query.featured;
    if (query.country)
      where.country = { contains: query.country, mode: 'insensitive' };
    if (query.category) where.category = query.category;
    if (query.type) where.contentType = query.type;
    if (query.featured !== undefined) where.isFeatured = query.featured;
    if (query.country)
      where.country = { contains: query.country, mode: 'insensitive' };
    if (query.category) where.category = query.category;

    return this.executeFindMany(where, skip, limit, userId);
  }
  return this.executeFindMany(where, skip, limit, userId);
}

  // Admin/moderator version - any status
  async findAllAnyStatus(
  query: {
  type?: MediaContentType;
  status?: MediaStatus;
  featured?: boolean;
  country?: string;
  category?: ProjectCategory;
  page?: number;
  limit?: number;
},
  userId: string, // required for like info
) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
  const skip = (page - 1) * limit;
  // Admin/moderator version - any status
  async findAllAnyStatus(
    query: {
    type?: MediaContentType;
    status?: MediaStatus;
    featured?: boolean;
    country?: string;
    category?: ProjectCategory;
    page?: number;
    limit?: number;
  },
    userId: string, // required for like info
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    const where: any = {};

    // Status is now fully respected - can be any value or multiple
    if (query.status) {
      where.status = query.status;
    }
    // You can also support multiple statuses if you want:
    // if (query.status) where.status = { in: Array.isArray(query.status) ? query.status : [query.status] };
    // Status is now fully respected - can be any value or multiple
    if (query.status) {
      where.status = query.status;
    }
    // You can also support multiple statuses if you want:
    // if (query.status) where.status = { in: Array.isArray(query.status) ? query.status : [query.status] };

    if (query.type) where.contentType = query.type;
    if (query.featured !== undefined) where.isFeatured = query.featured;
    if (query.country)
      where.country = { contains: query.country, mode: 'insensitive' };
    if (query.category) where.category = query.category;
    if (query.type) where.contentType = query.type;
    if (query.featured !== undefined) where.isFeatured = query.featured;
    if (query.country)
      where.country = { contains: query.country, mode: 'insensitive' };
    if (query.category) where.category = query.category;

    return this.executeFindMany(where, skip, limit, userId);
  }
  return this.executeFindMany(where, skip, limit, userId);
}

  // Common logic extraction
  private async executeFindMany(
  where: any,
  skip: number,
  limit: number,
  userId ?: string,
) {
  const [items, total] = await Promise.all([
    this.prisma.mediaContent.findMany({
      where,
      include: {
        assets: {
          orderBy: { order: 'asc' },
          take: 6,
          select: {
            id: true,
            type: true,
            cdnUrl: true,
            width: true,
            height: true,
          },
        },
        tags: {
          include: { tag: { select: { name: true, slug: true } } },
        },
      },
      skip,
      take: limit,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    this.prisma.mediaContent.count({ where }),
  ]);
  // Common logic extraction
  private async executeFindMany(
    where: any,
    skip: number,
    limit: number,
    userId ?: string,
  ) {
    const [items, total] = await Promise.all([
      this.prisma.mediaContent.findMany({
        where,
        include: {
          assets: {
            orderBy: { order: 'asc' },
            take: 6,
            select: {
              id: true,
              type: true,
              cdnUrl: true,
              width: true,
              height: true,
            },
          },
          tags: {
            include: { tag: { select: { name: true, slug: true } } },
          },
        },
        skip,
        take: limit,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.mediaContent.count({ where }),
    ]);

    let userLikes = new Set<string>();
    if (userId) {
      const likes = await this.prisma.mediaLike.findMany({
        where: { userId },
        select: { mediaContentId: true },
      });
      userLikes = new Set(likes.map((l) => l.mediaContentId));
    }
    let userLikes = new Set<string>();
    if (userId) {
      const likes = await this.prisma.mediaLike.findMany({
        where: { userId },
        select: { mediaContentId: true },
      });
      userLikes = new Set(likes.map((l) => l.mediaContentId));
    }

    const data = items.map((item) => ({
      ...item,
      likeCount: item.likeCount ?? 0,
      commentCount: item.commentCount ?? 0,
      userHasLiked: userId ? userLikes.has(item.id) : false,
    }));
    const data = items.map((item) => ({
      ...item,
      likeCount: item.likeCount ?? 0,
      commentCount: item.commentCount ?? 0,
      userHasLiked: userId ? userLikes.has(item.id) : false,
    }));

    return {
      data,
      pagination: {
        total,
        page: Math.floor(skip / limit) + 1,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }
  //====================extra
  return {
    data,
    pagination: {
      total,
      page: Math.floor(skip / limit) + 1,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}
  //====================extra

  // ───────────────────── Comments ─────────────────────

  async createMediaComment(
  mediaId: string,
  userId: string,
  dto: CreateMediaCommentDto,
) {
  return this.prisma.$transaction(async (tx) => {
    const media = await tx.mediaContent.findUnique({
      where: { id: mediaId },
      select: { id: true, status: true },
    });

    if (!media) throw new NotFoundException('Media not found');
    if (media.status !== MediaStatus.PUBLISHED) {
      throw new BadRequestException('Cannot comment on unpublished content');
    }

    // Validate parent if exists
    if (dto.parentId) {
      const parent = await tx.mediaComment.findUnique({
        where: { id: dto.parentId },
        select: { mediaContentId: true },
      });

      if (!parent || parent.mediaContentId !== mediaId) {
        throw new BadRequestException('Invalid parent comment');
      }
    }

    const comment = await tx.mediaComment.create({
      data: {
        content: dto.content.trim(),
        userId,
        mediaContentId: mediaId,
        parentId: dto.parentId,
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true },
        },
      },
    });

    await tx.mediaContent.update({
      where: { id: mediaId },
      data: { commentCount: { increment: 1 } },
    });

    return comment;
  });
}

  // async getMediaComments(
  //   mediaId: string,
  //   params: { page: number; limit: number; sort: 'newest' | 'oldest' },
  // ) {
  //   const { page = 1, limit = 20, sort = 'newest' } = params;

  //   const orderBy: { createdAt: 'asc' | 'desc' } = {
  //     createdAt: sort === 'oldest' ? 'asc' : 'desc',
  //   };

  //   const [comments, total] = await Promise.all([
  //     this.prisma.mediaComment.findMany({
  //       where: {
  //         mediaContentId: mediaId,
  //         parentId: null, // top level only
  //       },
  //       include: {
  //         user: {
  //           select: { id: true, name: true, avatar: true },
  //         },
  //         replies: {
  //           include: {
  //             user: { select: { id: true, name: true, avatar: true } },
  //           },
  //           orderBy: { createdAt: 'asc' },
  //         },
  //       },
  //       orderBy,
  //       skip: (page - 1) * limit,
  //       take: limit,
  //     }),

  //     this.prisma.mediaComment.count({
  //       where: { mediaContentId: mediaId, parentId: null },
  //     }),
  //   ]);

  //   return {
  //     data: comments,
  //     pagination: {
  //       total,
  //       page,
  //       limit,
  //       pages: Math.ceil(total / limit),
  //     },
  //   };
  // }

  async getMediaComments(
  mediaId: string,
  params: { page: number; limit: number; sort: 'newest' | 'oldest' },
  currentUserId ?: string,
) {
  const { page = 1, limit = 20, sort = 'newest' } = params;
  const orderBy: { createdAt: 'asc' | 'desc' } = {
    createdAt: sort === 'oldest' ? 'asc' : 'desc',
  };

  const [comments, total] = await Promise.all([
    this.prisma.mediaComment.findMany({
      where: {
        mediaContentId: mediaId,
        parentId: null,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { likes: true },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }) as Promise<
      Array<
        Awaited<ReturnType<typeof this.prisma.mediaComment.findFirst>> & {
          _count: { likes: number };
          replies: Array<
            Awaited<ReturnType<typeof this.prisma.mediaComment.findFirst>> & {
              _count?: { likes: number };
            }
          >;
        }
      >
    >,

    this.prisma.mediaComment.count({
      where: { mediaContentId: mediaId, parentId: null },
    }),
  ]);

  // Now TypeScript knows _count exists
  let userLikedCommentIds = new Set<string>();
  if (currentUserId) {
    const liked = await this.prisma.mediaCommentLike.findMany({
      where: {
        userId: currentUserId,
        commentId: {
          in: comments.flatMap((c) => [c.id, ...c.replies.map((r) => r.id)]),
        },
      },
      select: { commentId: true },
    });
    userLikedCommentIds = new Set(liked.map((l) => l.commentId));
  }

  const enrichedComments = comments.map((comment) => ({
    ...comment,
    likeCount: comment._count.likes, // ← now safe
    userHasLiked: userLikedCommentIds.has(comment.id),
    replies: comment.replies.map((reply) => ({
      ...reply,
      likeCount: reply._count?.likes ?? 0, // ← safe with ?.
      userHasLiked: userLikedCommentIds.has(reply.id),
    })),
  }));

  return {
    data: enrichedComments,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

  async toggleCommentLike(commentId: string, userId: string) {
  return this.prisma.$transaction(async (tx) => {
    const existing = await tx.mediaCommentLike.findUnique({
      where: {
        userId_commentId: { userId, commentId },
      },
    });

    if (existing) {
      await tx.mediaCommentLike.delete({ where: { id: existing.id } });
      await tx.mediaComment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
      });
      return { liked: false };
    }

    await tx.mediaCommentLike.create({
      data: { userId, commentId },
    });

    await tx.mediaComment.update({
      where: { id: commentId },
      data: { likeCount: { increment: 1 } },
    });

    return { liked: true };
  });
}

  // async deleteMediaComment(
  //   mediaId: string,
  //   commentId: string,
  //   userId: string,
  //   userRole: UserRole,
  //   isAdminForce: boolean = false
  // ) {
  //   return this.prisma.$transaction(async (tx) => {
  //     // 1. Find comment
  //     const comment = await tx.mediaComment.findUnique({
  //       where: { id: commentId },
  //       select: {
  //         id: true,
  //         userId: true,
  //         mediaContentId: true,
  //         parentId: true,
  //       },
  //     });

  //     if (!comment) {
  //       throw new NotFoundException('Comment not found');
  //     }

  //     if (comment.mediaContentId !== mediaId) {
  //       throw new BadRequestException('Comment does not belong to this media content');
  //     }

  //     // 2. Authorization
  //     const isOwner = comment.userId === userId;
  //     const isPrivileged = new Set([
  //       UserRole.SUPER_ADMIN,
  //       UserRole.ADMIN,
  //       UserRole.MEDIA_MANAGER,
  //     ]).has(userRole);

  //     if (!isAdminForce && !isOwner && !isPrivileged) {
  //       throw new ForbiddenException('You are not authorized to delete this comment');
  //     }

  //     // 3. Find comments to delete (original + direct replies)
  //     const commentsToDelete = await tx.mediaComment.findMany({
  //       where: {
  //         OR: [{ id: commentId }, { parentId: commentId }],
  //       },
  //       select: { id: true },
  //     });

  //     const deleteCount = commentsToDelete.length;

  //     // 4. Delete associated likes first
  //     await tx.mediaCommentLike.deleteMany({
  //       where: {
  //         commentId: { in: commentsToDelete.map((c) => c.id) },
  //       },
  //     });

  //     // 5. Delete comments
  //     await tx.mediaComment.deleteMany({
  //       where: {
  //         OR: [{ id: commentId }, { parentId: commentId }],
  //       },
  //     });

  //     // 6. Update counter (safe decrement)
  //     await tx.mediaContent.update({
  //       where: { id: mediaId },
  //       data: {
  //         commentCount: {
  //           decrement: deleteCount,
  //         },
  //       },
  //     });

  //     // Note: No need for extra gte check — deleteCount is always >= 1 here

  //     return {
  //       success: true,
  //       message: `Comment${deleteCount > 1 ? ' and its replies' : ''} deleted successfully`,
  //       deletedCount: deleteCount,
  //     };
  //   });
  // }
}
