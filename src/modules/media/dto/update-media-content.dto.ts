import { PartialType } from '@nestjs/mapped-types';
import { CreateMediaContentDto } from './create-media-content.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { MediaStatus } from '@prisma/client';

export class UpdateMediaContentDto extends PartialType(CreateMediaContentDto) {
  @IsEnum(MediaStatus)
  @IsOptional()
  status?: MediaStatus;
}