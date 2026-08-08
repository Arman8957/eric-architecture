import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from '../src/config/configuratin';
import { getCacheConfig } from './config/cache.config';
import { EncryptionModule } from './common/encryption/encryption.module';

import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { FileOptimizerService } from './utils/optimizer/file-optimizer.service';
import { CloudinaryStrategy } from './upload/strategies/cloudinary.strategy';
import { MailerModule } from './utils/email/email.module';
import { ProjectRequestModule } from './modules/users/user.module';
import { MediaModule } from './modules/media/media.module';
import { ProposalModule } from './modules/project-manager/proposal/proposal.module';
import { ProjectStageModule } from './modules/project-manager/project-stage/project-stage.module';
import { ProjectAdminRequestModule } from './modules/project-manager/project-request/project-request.module';
import { NotificationModule } from './modules/notification/notification.module';
import { FinancialModule } from './modules/financial/financial.module';

import { TeamModule } from './modules/project-manager/team/team.module';
import { RefundModule } from './modules/refund/refund.module';
import { PaymentModule } from './modules/payment/payment.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { ContactModule } from './modules/contact/contact.module';
import { ProjectAttachmentModule } from './modules/project-manager/project-attachment/project-attachment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      load: [configuration],
   
    }),

    ScheduleModule.forRoot(),

    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: getCacheConfig,
      inject: [ConfigService],
    }),


    AuthModule,
    PrismaModule,
    MailerModule,
    EncryptionModule,
    ProjectRequestModule,
    MediaModule,
    ProposalModule,
    ProjectStageModule,
    ProjectAdminRequestModule,
    NotificationModule,
    FinancialModule,
    TeamModule,
    RefundModule,
    PaymentModule,
    SiteSettingsModule,
    ContactModule,
    ProjectAttachmentModule,
  ],
  providers: [
    // MailerService is provided and exported by MailerModule — declaring it
    // here too would create a second instance (and duplicate SMTP transports).
    FileOptimizerService,
    CloudinaryStrategy,
  ],
  exports: [
    FileOptimizerService,
    CloudinaryStrategy,
  ],
})
export class AppModule {}
