import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { MercuryService } from './mercury.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [FinancialController],
  providers: [FinancialService, MercuryService],
  exports: [FinancialService, MercuryService],
})
export class FinancialModule {}
