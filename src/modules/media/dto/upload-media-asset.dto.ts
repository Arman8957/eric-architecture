// dto/upload-media-asset.dto.ts
import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class UploadMediaAssetDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  caption?: string;

  @IsString()
  @IsOptional()
  altText?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;
}