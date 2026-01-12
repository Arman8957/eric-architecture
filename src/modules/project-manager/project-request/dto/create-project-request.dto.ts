import { IsUUID } from 'class-validator';

export class AssignRequestDto {
  @IsUUID()
  userId: string;
}