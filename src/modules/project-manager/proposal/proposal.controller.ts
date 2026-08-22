// src/modules/proposal/proposal.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Delete,
  Query,
} from '@nestjs/common';
import { ProposalService } from './proposal.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { AddProposalServiceDto } from './dto/add-proposal-service.dto';
import { ProposalSignatureDto } from './dto/proposal-signature.dto';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import {
  UpdateProposalServiceDto,
  UpdateProposalStatusDto,
} from './dto/update-proposal-status.dto';
import {
  AddServiceWithApprovalDto,
  ApproveServiceDto,
} from './dto/service-approval.dto';
import { ReorderServicesDto } from './dto/reorder-services.dto';

@Controller('proposals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProposalController {
  constructor(private readonly proposalService: ProposalService) { }

  @Post()
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  create(
    @Body() createProposalDto: CreateProposalDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.create(createProposalDto, user);
  }

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'DRAFTER', 'EMPLOYEE')
  findAll(
    @CurrentUser() user: client.User,
    @Query('includeApprovalStatus') includeApprovalStatus?: string,
    @Query('projectRequestId') projectRequestId?: string,
  ) {
    return this.proposalService.findAll(user, includeApprovalStatus === 'true', projectRequestId);
  }

  @Get('my-proposals')
  getMyProposals(@CurrentUser() user: client.User) {
    return this.proposalService.getMyProposals(user);
  }

  @Get(':id/full')
  findOneWithFullData(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.findOneWithFullData(id, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: client.User) {
    return this.proposalService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  update(
    @Param('id') id: string,
    @Body() updateProposalDto: UpdateProposalDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.update(id, updateProposalDto, user);
  }

  @Post(':id/services')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  addService(
    @Param('id') id: string,
    @Body() addProposalServiceDto: AddProposalServiceDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.addService(id, addProposalServiceDto, user);
  }

  @Patch(':id/services/reorder')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  reorderServices(
    @Param('id') id: string,
    @Body() dto: ReorderServicesDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.reorderServices(id, dto.items, user);
  }

  @Post(':id/send')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  send(
    @Param('id') id: string,
    @Body() body: { architectSignature?: string; scopeNotes?: string },
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.send(
      id,
      user,
      body?.architectSignature,
      body?.scopeNotes,
    );
  }

  @Patch(':id/sign')
  sign(
    @Param('id') id: string,
    @Body() proposalSignatureDto: ProposalSignatureDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.sign(id, proposalSignatureDto, user);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateProposalStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProposalStatusDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.updateProposalStatus(
      id,
      user,
      dto.status,
      dto.notes,
    );
  }

  //===========for the service add ========

  @Patch(':id/services/:serviceId')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  updateService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @Body() updateServiceDto: UpdateProposalServiceDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.updateService(
      id,
      serviceId,
      updateServiceDto,
      user,
    );
  }

  // Delete service
  @Delete(':id/services/:serviceId')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  deleteService(
    @Param('id') id: string,
    @Param('serviceId') serviceId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.deleteService(id, serviceId, user);
  }

  // Delete proposal
  @Delete(':id')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  deleteProposal(
    @Param('id') id: string,
    @Body() body: { password?: string },
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.deleteProposal(id, body?.password ?? '', user);
  }

  @Post(':id/services/with-approval')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  addServiceWithApproval(
    @Param('id') id: string,
    @Body() dto: AddServiceWithApprovalDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.addServiceWithApproval(id, dto, user);
  }


  @Post(':proposalId/services/:serviceId/approval')
  approveOrRejectService(
    @Param('proposalId') proposalId: string,
    @Param('serviceId') serviceId: string,
    @Body() dto: ApproveServiceDto,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.handleServiceApproval(
      proposalId,
      serviceId,
      dto,
      user,
    );
  }

  @Get(':id/pending-approvals')
  getPendingApprovals(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    return this.proposalService.getPendingApprovals(id, user);
  }
}
