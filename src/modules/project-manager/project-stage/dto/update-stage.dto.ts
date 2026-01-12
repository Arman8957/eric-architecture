import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsInt, Min, Max, IsOptional } from 'class-validator';
import { CreateStageDto } from './create-stage.dto';
import { StageStatus } from '@prisma/client';

export class UpdateStageDto extends PartialType(CreateStageDto) {
  @IsOptional()
  @IsEnum(StageStatus)
  status?: StageStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  completedTasks?: number;
}
