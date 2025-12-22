// modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { JwtRefreshStrategy } from './jwt/jwt-refresh.strategy';
import { GoogleStrategy } from './google/google.strategy';

import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleController } from './google/google.controller';
import { JwtStrategy } from './jwt/jwt.strategy';
import { MailerService } from 'src/utils/email/email.service';
import { MailerModule } from 'src/utils/email/email.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    MailerModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, GoogleController],
  providers: [AuthService,MailerService, JwtStrategy, JwtRefreshStrategy, GoogleStrategy],
  exports: [AuthService],
})
export class AuthModule {}