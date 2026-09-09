// modules/project-manager/invoice/dto/invoice.dto.ts
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { InvoiceType } from '@prisma/client';

export class CreateInvoiceDto {
  @IsString()
  @MinLength(1, { message: 'Invoice name is required' })
  @MaxLength(200)
  name!: string;

  @IsEnum(InvoiceType, {
    message: 'Invoice type must be REIMBURSABLE_EXPENSE or ADDITIONAL_SERVICE',
  })
  type!: InvoiceType;

  /**
   * Above zero: an invoice for nothing is not a bill, and a negative one would
   * be a credit note — a different thing entirely, with different accounting.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Invoice amount must be greater than zero' })
  amount!: number;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  /**
   * Which contract this invoice extends — the original or a named amendment.
   * Optional so a bill can still be raised against a project whose contract
   * has since been removed, rather than being blocked by it.
   */
  @IsUUID()
  @IsOptional()
  proposalId?: string;
}

export class CancelInvoiceDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
