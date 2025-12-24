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
import { CreateMediaContentDto } from './dto/create-media-content.dto';
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
  ) {}

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
      throw new ForbiddenException('Not authorized to add assets to this content');
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

    if (
      !this.allowedMediaRoles.has(userRole) &&
      media.createdById !== userId
    ) {
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
      !this.allowedMediaRoles.has(userRole) &&    // ← FIXED HERE
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

  // Public queries
  async findAll(query: {
    type?: MediaContentType;
    status?: MediaStatus;
    featured?: boolean;
    country?: string;
    category?: ProjectCategory;
    page: number;
    limit: number;
  }) {
    const { page = 1, limit = 12, ...filters } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      status: filters.status || MediaStatus.PUBLISHED,
    };

    if (filters.type) where.contentType = filters.type;
    if (filters.featured) where.isFeatured = true;
    if (filters.country)
      where.country = { contains: filters.country, mode: 'insensitive' };
    if (filters.category) where.category = filters.category;

    const [items, total] = await Promise.all([
      this.prisma.mediaContent.findMany({
        where,
        include: {
          assets: {
            orderBy: { order: 'asc' },
            take: 6, // preview limit
          },
          tags: {
            include: { tag: { select: { name: true, slug: true } } },
          },
        },
        skip,
        take: limit,
        orderBy: [
          filters.featured ? { featuredOrder: 'asc' } : {},
          { publishedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.mediaContent.count({ where }),
    ]);

    return {
      data: items,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findBySlug(slug: string, incrementView = true) {
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

    return item;
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
}
