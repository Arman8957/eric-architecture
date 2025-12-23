import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { BullModule } from '@nestjs/bullmq';

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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
      load: [configuration],
   
    }),

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
  ],
  providers: [
    PrismaService,
    MailerService,
    FileOptimizerService,
    CloudinaryStrategy,
  ],
  exports: [
    PrismaService,
    MailerService,
    FileOptimizerService,
    CloudinaryStrategy,
  ],
})
export class AppModule {}
