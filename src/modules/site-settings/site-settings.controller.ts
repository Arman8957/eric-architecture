import {
  Controller,
  Get,
  Patch,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import {
  SiteSettingsService,
  parseTimeToMinutes,
  normaliseWeekdays,
} from './site-settings.service';
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
  // Public to read, for the same reason as the consultation fee above: the New
  // Project wizard offers appointment slots before a visitor has an account, so
  // a signed-in-only read left anonymous bookers with no times to choose from.
  // A daily opening window is not sensitive. Only a super admin can change it.

  @Get('office-hours')
  async getOfficeHours() {
    const hours = await this.siteSettingsService.getOfficeHours();
    return { success: true, data: hours };
  }

  /**
   * Time off and confirmed meetings on the consultation calendar, so the New
   * Project wizard can grey those days out. Public for the same reason office
   * hours are — the wizard runs before sign-up — and returns only start/end,
   * never a title or a client name.
   */
  @Get('consultation-availability')
  async getConsultationAvailability(
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('from and to must be ISO date strings');
    }
    if (toDate <= fromDate) {
      throw new BadRequestException('to must be after from');
    }

    const busy = await this.siteSettingsService.getConsultationBusy(
      fromDate,
      toDate,
    );
    return { success: true, data: busy };
  }

  @Patch('office-hours')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN)
  async updateOfficeHours(
    @Body('start') start: string,
    @Body('end') end: string,
    @Body('days') days?: unknown,
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

    // Sent as 0 (Sunday) through 6 (Saturday). Anything outside that is
    // dropped rather than stored, so a bad value can't quietly close a day.
    if (days !== undefined && !Array.isArray(days)) {
      throw new BadRequestException(
        'days must be an array of weekday numbers, 0 (Sunday) to 6 (Saturday)',
      );
    }

    const normalisedDays = normaliseWeekdays(days);

    // Saving with nothing ticked would take the calendar offline entirely and
    // read, to a client, as though booking were broken. Refused here so the
    // mistake surfaces at the point it is made.
    if (normalisedDays.length === 0) {
      throw new BadRequestException(
        'Pick at least one day the office is open, otherwise no meeting can ever be booked',
      );
    }

    const hours = await this.siteSettingsService.setOfficeHours({
      start,
      end,
      days: normalisedDays,
    });
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
