import { IsString, IsArray, IsUUID, IsOptional } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  name!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  memberIds?: string[];
}
