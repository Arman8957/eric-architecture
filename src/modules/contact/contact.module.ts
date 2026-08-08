import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { MailerModule } from 'src/utils/email/email.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [MailerModule, PrismaModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
