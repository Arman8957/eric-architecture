import { IsString, IsNumber, IsOptional, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class BankDetailsDto {
  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @IsString()
  @IsNotEmpty()
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  routingNumber!: string;

  @IsString()
  @IsOptional()
  branchName?: string;

  @IsString()
  @IsOptional()
  bankType?: string; // "TRADITIONAL", "ONLINE", "CREDIT_UNION", "MOBILE_BANK"
}

export class CreateRefundDto {
  @IsString()
  @IsNotEmpty()
  projectRequestId!: string;

  @IsString()
  @IsNotEmpty()
  stageId!: string;

  @IsString()
  @IsNotEmpty()
  stageName!: string;

  @IsString()
  @IsNotEmpty()
  refundCause!: string;

  @IsString()
  @IsNotEmpty()
  refundDescription!: string;

  @IsNumber()
  amount!: number;

  @ValidateNested()
  @Type(() => BankDetailsDto)
  @IsOptional()
  bankDetails?: BankDetailsDto;
}
