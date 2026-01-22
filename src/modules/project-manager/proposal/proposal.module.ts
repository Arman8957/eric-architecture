import { Module } from '@nestjs/common';
import { ProposalService } from './proposal.service';
import { ProposalController } from './proposal.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from 'src/utils/email/email.module';


@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [ProposalController],
  providers: [ProposalService],
  exports: [ProposalService],
})
export class ProposalModule {}