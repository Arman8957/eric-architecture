import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateProjectRequestDto } from './project-request.dto';
import { RequestStatus } from '@prisma/client';

export class UpdateProjectRequestDto extends PartialType(
  CreateProjectRequestDto,
) {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;
    email: any;
    appointmentDate: any;
}
