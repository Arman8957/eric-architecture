import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { SiteSettingsService, parseTimeToMinutes } from './site-settings.service';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import * as client from '@prisma/client';

@Controller('site-settings')
export class SiteSettingsController {
  constructor(private readonly siteSettingsService: SiteSettingsService) {}

  // Public: the New Project wizard shows the fee before a visitor has an
  // account (account-less inquiry flow). It's just a price, not sensitive.
  @Get('consultation-fee')
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

  // ── Office hours ───────────────────────────────────────────────────────
  // Readable by any signed-in user, because the client booking form has to
  // know the window. Only a super admin can change it.

  @Get('office-hours')
  @UseGuards(JwtAuthGuard)
  async getOfficeHours() {
    const hours = await this.siteSettingsService.getOfficeHours();
    return { success: true, data: hours };
  }

  @Patch('office-hours')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN)
  async updateOfficeHours(
    @Body('start') start: string,
    @Body('end') end: string,
  ) {
    const startMinutes = parseTimeToMinutes(start);
    const endMinutes = parseTimeToMinutes(end);

    if (startMinutes === null || endMinutes === null) {
      throw new BadRequestException(
        'start and end must be times in HH:MM 24-hour format',
      );
    }

    if (endMinutes <= startMinutes) {
      throw new BadRequestException('Office hours must end after they start');
    }

    const hours = await this.siteSettingsService.setOfficeHours({ start, end });
    return { success: true, data: hours };
  }

  // ── Media quick-add tags ───────────────────────────────────────────────

  @Get('media-quick-tags')
  @UseGuards(JwtAuthGuard)
  async getMediaQuickTags() {
    const tags = await this.siteSettingsService.getMediaQuickTags();
    return { success: true, data: tags };
  }

  @Patch('media-quick-tags')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.MEDIA_MANAGER,
  )
  async updateMediaQuickTags(@Body('tags') tags: string[]) {
    if (!Array.isArray(tags)) {
      throw new BadRequestException('tags must be an array of strings');
    }
    const saved = await this.siteSettingsService.setMediaQuickTags(tags);
    return { success: true, data: saved };
  }

  // ── YouTube channel ────────────────────────────────────────────────────

  @Get('youtube-channel')
  @UseGuards(JwtAuthGuard)
  async getYoutubeChannel() {
    const url = await this.siteSettingsService.getYoutubeChannelUrl();
    return { success: true, data: { url } };
  }

  @Patch('youtube-channel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.MEDIA_MANAGER,
  )
  async updateYoutubeChannel(@Body('url') url: string) {
    const trimmed = String(url ?? '').trim();

    // An empty value clears the saved channel; anything else has to be a real
    // http(s) link, or the "Go to Channel" button would lead nowhere.
    if (trimmed && !/^https?:\/\/[^\s]+$/i.test(trimmed)) {
      throw new BadRequestException(
        'Enter a full channel URL, starting with http:// or https://',
      );
    }

    const saved = await this.siteSettingsService.setYoutubeChannelUrl(trimmed);
    return { success: true, data: { url: saved } };
  }
}
