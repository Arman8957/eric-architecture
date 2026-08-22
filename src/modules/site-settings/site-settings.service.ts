import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const CONSULTATION_FEE_KEY = 'consultation_fee_usd';
const DEFAULT_CONSULTATION_FEE_USD = 250;

const OFFICE_HOURS_KEY = 'office_hours';
/** Booking window used until a super admin sets one, in local 24h time. */
const DEFAULT_OFFICE_HOURS = { start: '08:00', end: '18:00' };

const MEDIA_QUICK_TAGS_KEY = 'media_quick_tags';
const DEFAULT_MEDIA_QUICK_TAGS = ['ECO_FRIENDLY', 'SOLAR_POWERED', 'LUXURY'];

export interface OfficeHours {
  /** "HH:MM", 24-hour. */
  start: string;
  end: string;
}

/** Minutes past midnight for an "HH:MM" string, or null if it isn't one. */
export function parseTimeToMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

@Injectable()
export class SiteSettingsService {
  constructor(private prisma: PrismaService) {}

  async get(key: string): Promise<string | null> {
    const setting = await this.prisma.siteSettings.findUnique({
      where: { key },
    });
    return setting?.value ?? null;
  }

  async set(key: string, value: string, description?: string) {
    return this.prisma.siteSettings.upsert({
      where: { key },
      update: { value, ...(description ? { description } : {}) },
      create: { key, value, description },
    });
  }

  async getConsultationFeeUsd(): Promise<number> {
    const raw = await this.get(CONSULTATION_FEE_KEY);
    const parsed = raw ? parseFloat(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_CONSULTATION_FEE_USD;
  }

  async setConsultationFeeUsd(feeUsd: number) {
    await this.set(
      CONSULTATION_FEE_KEY,
      String(feeUsd),
      'Consultation fee (USD) charged before a project request is submitted',
    );
    return this.getConsultationFeeUsd();
  }

  /**
   * The window clients may book meetings in, firm-wide. Stored as JSON in the
   * key/value settings table, so no schema change is needed. A malformed or
   * missing value falls back to the default rather than blocking every booking.
   */
  async getOfficeHours(): Promise<OfficeHours> {
    const raw = await this.get(OFFICE_HOURS_KEY);
    if (!raw) return { ...DEFAULT_OFFICE_HOURS };

    try {
      const parsed = JSON.parse(raw);
      const start = parseTimeToMinutes(parsed?.start);
      const end = parseTimeToMinutes(parsed?.end);
      if (start === null || end === null || end <= start) {
        return { ...DEFAULT_OFFICE_HOURS };
      }
      return { start: parsed.start, end: parsed.end };
    } catch {
      return { ...DEFAULT_OFFICE_HOURS };
    }
  }

  /**
   * The "Quick add" tag suggestions on the media form. Deliberately separate
   * from the MediaTag rows attached to real media: removing a suggestion is a
   * curation choice and must never strip the tag off published content.
   */
  async getMediaQuickTags(): Promise<string[]> {
    const raw = await this.get(MEDIA_QUICK_TAGS_KEY);
    if (!raw) return [...DEFAULT_MEDIA_QUICK_TAGS];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [...DEFAULT_MEDIA_QUICK_TAGS];
      return parsed.filter((t): t is string => typeof t === 'string');
    } catch {
      return [...DEFAULT_MEDIA_QUICK_TAGS];
    }
  }

  async setMediaQuickTags(tags: string[]): Promise<string[]> {
    // Normalised the same way the media form normalises a typed tag, and
    // de-duplicated so the list can't grow copies of the same suggestion.
    const normalised = Array.from(
      new Set(
        tags
          .map((t) => String(t ?? '').trim().toUpperCase().replace(/\s+/g, '_'))
          .filter(Boolean),
      ),
    );

    await this.set(
      MEDIA_QUICK_TAGS_KEY,
      JSON.stringify(normalised),
      'Quick-add tag suggestions offered on the media create/edit form',
    );
    return this.getMediaQuickTags();
  }

  async setOfficeHours(hours: OfficeHours): Promise<OfficeHours> {
    await this.set(
      OFFICE_HOURS_KEY,
      JSON.stringify({ start: hours.start, end: hours.end }),
      'Daily window (local 24h time) clients may book meetings within',
    );
    return this.getOfficeHours();
  }
}
