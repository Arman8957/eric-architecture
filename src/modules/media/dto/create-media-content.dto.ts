import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  Min,
  IsBoolean,
  IsNumber,
  IsObject,
  IsUUID,
} from 'class-validator';
import { MediaContentType, MediaStatus, ProjectCategory } from '@prisma/client';
import {
  ContinentType,
  ClimateType,
} from '@prisma/client';

export class CreateMediaContentDto {
  @IsEnum(MediaContentType)
  contentType!: MediaContentType;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  excerpt?: string;

  @IsString()
  content!: string; // rich text / markdown

  // Location fields (mainly WORLD_PROJECT)
  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsOptional()
  @IsObject()
  coordinates?: { lat: number; lng: number };

  // Project info
  @IsInt()
  @Min(1900)
  @IsOptional()
  projectYear?: number;

  @IsNumber()
  @IsOptional()
  projectArea?: number;

  @IsString()
  @IsOptional()
  projectClient?: string;

  @IsString()
  @IsOptional()
  architect?: string;

  @IsString()
  @IsOptional()
  photographer?: string;

  //world project specific
  @IsEnum(ContinentType)
  @IsOptional()
  continent?: ContinentType;

  @IsEnum(ClimateType)
  @IsOptional()
  climate?: ClimateType;

  // Portfolio specific
  @IsEnum(ProjectCategory)
  @IsOptional()
  category?: ProjectCategory;

  /** What "Other" means, when the category is OTHER. */
  @IsString()
  @IsOptional()
  categoryOther?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectTags?: string[];

  // Article/News specific
  @IsString()
  @IsOptional()
  author?: string;

  @IsString()
  @IsOptional()
  publisher?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsOptional()
  publishDate?: Date;

  @IsOptional()
  uploadDate?: Date;

  // Common
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  featuredOrder?: number;

  @IsEnum(MediaStatus)
  @IsOptional()
  status?: MediaStatus;
}

export class CreateMediaCommentDto {
  @IsString()
  content!: string;

  @IsUUID()
  @IsOptional()
  parentId?: string;
}