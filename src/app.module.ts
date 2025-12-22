// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';

import configuration from '../src/config/configuratin';           // ← Correct relative path
import validationSchema from './config/validation.schema';     // ← Zod schema
import { getCacheConfig } from './config/cache.config';         // ← Clean Redis config

import { AuthModule } from './modules/auth/auth.module';
import { PrismaService } from './prisma/prisma.service';
import { MailerService } from './utils/email/email.service';
import { FileOptimizerService } from './utils/optimizer/file-optimizer.service';
import { PrismaModule } from './prisma/prisma.module';
import { CloudinaryStrategy } from './upload/strategies/cloudinary.strategy';

@Module({
  imports: [
    // Global Config with Zod validation
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: true,
      },
    }),

    // Redis Cache (clean way)
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: getCacheConfig,
      inject: [ConfigService],
    }),

    // BullMQ for background jobs
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),

    // Register queues
    BullModule.registerQueue({
      name: 'video-processing',
    }),

    // Feature modules
    AuthModule,
    PrismaModule,
    // UsersModule,
    // UploadModule,
    // SettingsModule,
  ],
  providers: [
    PrismaService,
    MailerService,
    FileOptimizerService,
    CloudinaryStrategy
  ],
  exports: [
    PrismaService,
    MailerService,
    FileOptimizerService,
    CloudinaryStrategy
  ],
})
export class AppModule {}