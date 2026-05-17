import { Module } from '@nestjs/common';
import { ProposalService } from './proposal.service';
import { ProposalController } from './proposal.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailerModule } from 'src/utils/email/email.module';


import { MasterContractService } from './master-contract/master-contract.service';
import { AmendmentContractController } from './amendment-contract/amendment-contract.controller';
import { AmendmentContractService } from './amendment-contract/amendment-contract.service';
import { AmendmentController } from './amendment/amendment.controller';
import { AmendmentService } from './amendment/amendment.service';
import { MasterContractController } from './master-contract/master-contract.controller';



@Module({
  imports: [PrismaModule, MailerModule],
  controllers: [ProposalController, AmendmentController, MasterContractController, AmendmentContractController],
  providers: [ProposalService, AmendmentService, MasterContractService, AmendmentContractService],
  exports: [ProposalService, AmendmentService, MasterContractService, AmendmentContractService],
})
export class ProposalModule { }