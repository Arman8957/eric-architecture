
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ProposalStatus } from '@prisma/client';

export class UpdateProposalStatusDto {
  @IsEnum(ProposalStatus)
  status: ProposalStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateProposalServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  order?: number;
}