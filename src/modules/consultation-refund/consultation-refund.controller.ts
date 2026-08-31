import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import * as client from '@prisma/client';
import { ConsultationRefundService } from './consultation-refund.service';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('consultation-refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConsultationRefundController {
  constructor(
    private readonly consultationRefundService: ConsultationRefundService,
  ) {}

  @Get()
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.FINANCE,
    client.UserRole.PROJECT_MANAGER,
  )
  async getAll() {
    return this.consultationRefundService.getAll();
  }

  @Post(':id/process')
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.FINANCE)
  @HttpCode(HttpStatus.OK)
  async process(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.consultationRefundService.process(id, user);
  }
}
