import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AmendmentService } from './amendment.service';
import {
  CreateAmendmentRequestDto,
  ReviewAmendmentDto,
  CreateAmendmentProposalDto,
} from './dto/amendment.dto';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';

@Controller('proposals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AmendmentController {
  constructor(private readonly amendmentService: AmendmentService) {}

  // ============ Client Endpoints ============

  /**
   * Client creates amendment request for their proposal
   */
  @Post(':proposalId/amendments')
  createAmendmentRequest(
    @Param('proposalId') proposalId: string,
    @Body() dto: CreateAmendmentRequestDto,
    @CurrentUser() user: client.User,
  ) {
    return this.amendmentService.createAmendmentRequest(
      proposalId,
      dto,
      user,
    );
  }

  /**
   * Get amendment requests for a proposal
   */
  @Get(':proposalId/amendments')
  getAmendmentRequests(
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: client.User,
    @Query('status') status?: string,
  ) {
    return this.amendmentService.getAmendmentRequests(
      proposalId,
      user,
      status,
    );
  }

  /**
   * Get single amendment request
   */
  @Get(':proposalId/amendments/:amendmentId')
  getAmendmentRequest(
    @Param('proposalId') proposalId: string,
    @Param('amendmentId') amendmentId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.amendmentService.getAmendmentRequest(
      proposalId,
      amendmentId,
      user,
    );
  }

  // ============ Project Manager Endpoints ============

  /**
   * PM reviews amendment request (approve/reject)
   */
  @Patch('amendments/:amendmentId/review')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  reviewAmendmentRequest(
    @Param('amendmentId') amendmentId: string,
    @Body() dto: ReviewAmendmentDto,
    @CurrentUser() user: client.User,
  ) {
    return this.amendmentService.reviewAmendmentRequest(
      amendmentId,
      dto,
      user,
    );
  }

  /**
   * PM creates proposal from amendment request
   */
  @Post('amendments/:amendmentId/create-proposal')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  createProposalFromAmendment(
    @Param('amendmentId') amendmentId: string,
    @Body() dto: CreateAmendmentProposalDto,
    @CurrentUser() user: client.User,
  ) {
    return this.amendmentService.createProposalFromAmendment(
      amendmentId,
      dto,
      user,
    );
  }

  /**
   * PM marks amendment as completed
   */
  @Patch('amendments/:amendmentId/complete')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  completeAmendment(
    @Param('amendmentId') amendmentId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.amendmentService.completeAmendment(amendmentId, user);
  }

  /**
   * Get all amendment requests (PM dashboard)
   */
  @Get('amendments/all')
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.PROJECT_MANAGER,
  )
  getAllAmendmentRequests(
    @CurrentUser() user: client.User,
    @Query('status') status?: string,
  ) {
    return this.amendmentService.getAllAmendmentRequests(user, status);
  }

  // ============ Amendment Proposals ============

  /**
   * Get all proposals for a specific proposal (normal + amendments)
   */
  @Get(':proposalId/all-proposals')
  getAllProposalsForProject(
    @Param('proposalId') proposalId: string,
    @CurrentUser() user: client.User,
  ) {
    return this.amendmentService.getAllProposalsForProject(proposalId, user);
  }
}