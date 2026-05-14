import { IsString, IsNumber, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsNotEmpty()
  projectRequestId: string;

  @IsString()
  @IsNotEmpty()
  proposalId: string;

  @IsString()
  @IsOptional()
  stageId?: string; // null for lump sum

  @IsString()
  @IsOptional()
  stageName?: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsNotEmpty()
  paymentType: string; // "LUMP_SUM" or "INSTALLMENT"

  @IsString()
  @IsNotEmpty()
  projectName: string;
}
