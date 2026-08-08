import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import * as client from '@prisma/client';

@Controller('site-settings')
export class SiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  @Get('consultation-fee')
  @UseGuards(JwtAuthGuard)
  async getConsultationFee() {
    const feeUsd = await this.siteSettingsService.getConsultationFeeUsd();
    return { success: true, data: { feeUsd } };
  }

  @Patch('consultation-fee')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.PROJECT_MANAGER,
    client.UserRole.FINANCE,
  )
  async updateConsultationFee(@Body('feeUsd') feeUsd: number) {
    if (typeof feeUsd !== 'number' || !Number.isFinite(feeUsd) || feeUsd <= 0) {
      throw new BadRequestException('feeUsd must be a positive number');
    }
    const updated = await this.siteSettingsService.setConsultationFeeUsd(feeUsd);
    return { success: true, data: { feeUsd: updated } };
  }
}
