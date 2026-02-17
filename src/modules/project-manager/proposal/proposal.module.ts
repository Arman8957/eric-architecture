import { Module } from '@nestjs/common';
import { ProposalService } from './proposal.service';
import { ProposalController } from './proposal.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from 'src/utils/email/email.module';
import { AmendmentController } from './amendment.controller';
import { AmendmentService } from './amendment.service';


@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [ProposalController, AmendmentController],
  providers: [ProposalService, AmendmentService],
  exports: [ProposalService, AmendmentService],
})
export class ProposalModule {}