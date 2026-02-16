import { IsEnum, IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';

export class ApproveServiceDto {
  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}

export class AddServiceWithApprovalDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  cost!: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  quantity?: number;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}