import { Module } from '@nestjs/common';
import { ProposalService } from './proposal.service';
import { ProposalController } from './proposal.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from 'src/utils/email/email.module';
import { AmendmentController } from './amendment.controller';
import { AmendmentService } from './amendment.service';
import { MasterContractController } from './master-contract.controller';
import { MasterContractService } from './master-contract.service';
import { AmendmentContractController } from './amendment-contract.controller';
import { AmendmentContractService } from './amendment-contract.service';



@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [ProposalController, AmendmentController, MasterContractController, AmendmentContractController],
  providers: [ProposalService, AmendmentService, MasterContractService, AmendmentContractService],
  exports: [ProposalService, AmendmentService, MasterContractService, AmendmentContractService],
})
export class ProposalModule { }