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
} from 'class-validator';
import { MediaContentType, MediaStatus, ProjectCategory } from '@prisma/client';

export class CreateMediaContentDto {
  @IsEnum(MediaContentType)
  contentType: MediaContentType;

  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  excerpt?: string;

  @IsString()
  content: string; // rich text / markdown

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

  // Portfolio specific
  @IsEnum(ProjectCategory)
  @IsOptional()
  category?: ProjectCategory;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectTags?: string[];

  // Article/News specific
  @IsString()
  @IsOptional()
  author?: string;

  @IsOptional()
  publishDate?: Date;

  // Common
  @IsBoolean()
  @IsOptional()
  isFeatured?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  featuredOrder?: number;
}