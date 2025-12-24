import {
  IsEnum,
  IsOptional,
  IsString,
  IsBooleanString,
  IsInt,
  Min,
} from 'class-validator';
import { MediaContentType, MediaStatus, ProjectCategory } from '@prisma/client';
import { Type } from 'class-transformer';

export class MediaQueryDto {
  @IsEnum(MediaContentType)
  @IsOptional()
  type?: MediaContentType;

  @IsEnum(MediaStatus)
  @IsOptional()
  status?: MediaStatus = MediaStatus.PUBLISHED;

  @IsBooleanString()
  @IsOptional()
  featured?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsEnum(ProjectCategory)
  @IsOptional()
  category?: ProjectCategory;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 12;
}
