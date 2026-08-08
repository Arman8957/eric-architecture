import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

const CONSULTATION_FEE_KEY = 'consultation_fee_usd';
const DEFAULT_CONSULTATION_FEE_USD = 250;

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
}
