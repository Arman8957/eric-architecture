import { IsString, IsDecimal, IsInt } from 'class-validator';

export class AddProposalServiceDto {
  @IsString() name: string;
  @IsDecimal() cost: number;
  @IsInt() timelineWeeks: number;
    description: any;
}