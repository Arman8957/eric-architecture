// src/utils/email/mailer.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from './email.service';


@Module({
  imports: [
    ConfigModule, // needed for ConfigService injection
  ],
  providers: [
    MailerService,
  ],
  exports: [
    MailerService, 
  ],
})
export class MailerModule {}
