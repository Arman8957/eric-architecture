import { IsString } from 'class-validator';

export class ProposalSignatureDto {
  @IsString() type: 'owner' | 'architect';
  @IsString() signature: string; // e.g., base64 image or text
}