import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from '../src/config/configuratin';
// import { envValidationSchema } from '../src/config/validation-joi.schema';
import { getCacheConfig } from './config/cache.config';

import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { MailerService } from './utils/email/email.service';
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

    // BullModule.forRootAsync({
    //   imports: [ConfigModule],
    //   useFactory: (config: ConfigService) => ({
    //     connection: {
    //       host: config.get<string>('REDIS_HOST'),
    //       port: config.get<number>('REDIS_PORT'),
    //       password: config.get<string>('REDIS_PASSWORD'),
    //     },
    //   }),
    //   inject: [ConfigService],
    // }),

    // BullModule.registerQueue({
    //   name: 'video-processing',
    // }),

    AuthModule,
    PrismaModule,
    MailerModule,
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
  ],
  providers: [
    MailerService,
    FileOptimizerService,
    CloudinaryStrategy,
  ],
  exports: [
    MailerService,
    FileOptimizerService,
    CloudinaryStrategy,
  ],
})
export class AppModule {}
