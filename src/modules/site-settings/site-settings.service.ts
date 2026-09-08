import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const CONSULTATION_FEE_KEY = 'consultation_fee_usd';
const DEFAULT_CONSULTATION_FEE_USD = 250;

const OFFICE_HOURS_KEY = 'office_hours';

/** 0 = Sunday … 6 = Saturday, matching `Date#getDay`. */
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * Booking window used until a super admin sets one, in local 24h time.
 *
 * Every day open by default: a firm that has never touched the setting keeps
 * behaving exactly as it did before open days existed.
 */
const DEFAULT_OFFICE_HOURS = {
  start: '08:00',
  end: '18:00',
  days: ALL_WEEKDAYS,
};

const MEDIA_QUICK_TAGS_KEY = 'media_quick_tags';
const DEFAULT_MEDIA_QUICK_TAGS = ['ECO_FRIENDLY', 'SOLAR_POWERED', 'LUXURY'];

const YOUTUBE_CHANNEL_URL_KEY = 'youtube_channel_url';

export interface OfficeHours {
  /** "HH:MM", 24-hour. */
  start: string;
  end: string;
  /**
   * Weekdays the office is open, 0 = Sunday … 6 = Saturday. A day that is not
   * listed is closed: no slot is offered on it and no booking is accepted for
   * it, whatever the times above say.
   */
  days: number[];
}

/**
 * Normalise whatever is stored into a clean weekday list.
 *
 * Absent means "open every day" rather than "closed every day" — the setting
 * predates open days, so a value written before this existed must not silently
 * shut the calendar. An explicitly empty list is honoured: that is a firm
 * saying it takes no meetings at all.
 */
export function normaliseWeekdays(value: unknown): number[] {
  if (value === undefined || value === null) return [...ALL_WEEKDAYS];
  if (!Array.isArray(value)) return [...ALL_WEEKDAYS];

  const days = value
    // Dropped before coercion, not after: `Number(null)`, `Number('')` and
    // `Number(false)` are all 0, which would quietly mark Sunday open on the
    // strength of a null in the payload.
    .filter(
      (d) =>
        d !== null &&
        d !== undefined &&
        d !== '' &&
        typeof d !== 'boolean' &&
        !Array.isArray(d),
    )
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  return [...new Set(days)].sort((a, b) => a - b);
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
      return {
        start: parsed.start,
        end: parsed.end,
        days: normaliseWeekdays(parsed?.days),
      };
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

  /** The firm's YouTube channel, or "" when none has been saved yet. */
  async getYoutubeChannelUrl(): Promise<string> {
    return (await this.get(YOUTUBE_CHANNEL_URL_KEY)) ?? '';
  }

  /**
   * Save the channel link. An empty string clears it, which is how the Media
   * Center's "Go to Channel" button gets turned back into an empty input.
   */
  async setYoutubeChannelUrl(url: string): Promise<string> {
    const trimmed = String(url ?? '').trim();

    await this.set(
      YOUTUBE_CHANNEL_URL_KEY,
      trimmed,
      "The firm's YouTube channel, linked from the Media Center",
    );
    return this.getYoutubeChannelUrl();
  }

  /**
   * Time the firm cannot take a consultation in, for the New Project wizard.
   *
   * That wizard runs before the visitor has an account and before any manager
   * is assigned, so it cannot use the authenticated availability endpoint —
   * which is why time blocked off in the Master Schedule was showing as
   * bookable there. The consultation sits with the firm's owner until a manager
   * picks the project up, so the owner's calendar is the one that governs.
   *
   * Deliberately stripped: an anonymous visitor gets start/end and nothing
   * else. No titles, no notes, no client names — only that the studio is not
   * free then.
   */
  async getConsultationBusy(
    from: Date,
    to: Date,
  ): Promise<{ start: string; end: string; allDay: boolean }[]> {
    const owner = await this.prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!owner) return [];

    const [blocks, meetings] = await Promise.all([
      this.prisma.scheduleBlock.findMany({
        where: { userId: owner.id, startAt: { lt: to }, endAt: { gt: from } },
        select: { startAt: true, endAt: true, allDay: true },
      }),
      // Only confirmed meetings hold a slot. A request still awaiting a reply
      // must not stop someone else asking for the same time.
      this.prisma.meetingLink.findMany({
        where: {
          status: 'ACCEPTED',
          scheduledAt: { lt: to },
          sentByUserId: owner.id,
        },
        select: { scheduledAt: true, endsAt: true },
      }),
    ]);

    const ranges = [
      ...blocks.map((b) => ({
        start: b.startAt,
        end: b.endAt,
        allDay: b.allDay,
      })),
      ...meetings
        .filter((m) => m.endsAt && m.endsAt > from)
        .map((m) => ({
          start: m.scheduledAt,
          end: m.endsAt as Date,
          allDay: false,
        })),
    ];

    return ranges.map((r) => ({
      start: r.start.toISOString(),
      end: r.end.toISOString(),
      allDay: r.allDay,
    }));
  }

  async setOfficeHours(hours: OfficeHours): Promise<OfficeHours> {
    await this.set(
      OFFICE_HOURS_KEY,
      JSON.stringify({
        start: hours.start,
        end: hours.end,
        days: normaliseWeekdays(hours.days),
      }),
      'Days and daily window (local 24h time) clients may book meetings within',
    );
    return this.getOfficeHours();
  }
}
