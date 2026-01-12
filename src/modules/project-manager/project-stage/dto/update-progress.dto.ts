import { IsInt, Min, Max, IsOptional, IsString } from 'class-validator';

export class UpdateProgressDto {
  @IsInt()
  @Min(0)
  @Max(100)
  progress: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  completedTasks?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}