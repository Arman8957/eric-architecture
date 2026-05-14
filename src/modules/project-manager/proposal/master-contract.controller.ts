import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    UseGuards,
} from '@nestjs/common';
import {
    CreateMasterContractDto,
    UpdateMasterContractDto,
    ClientSignContractDto,
} from './dto/master-contract.dto';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { MasterContractService } from './master-contract.service';

@Controller('master-contract')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MasterContractController {
    constructor(
        private readonly masterContractService: MasterContractService,
    ) { }

    // ──── CRUD for Master Contract Articles ────

    @Get()
    findAll() {
        return this.masterContractService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.masterContractService.findOne(id);
    }

    @Post()
    @Roles(
        client.UserRole.SUPER_ADMIN,
        client.UserRole.ADMIN,
        client.UserRole.PROJECT_MANAGER,
    )
    create(
        @Body() dto: CreateMasterContractDto,
        @CurrentUser() user: client.User,
    ) {
        return this.masterContractService.create(dto);
    }

    @Patch(':id')
    @Roles(
        client.UserRole.SUPER_ADMIN,
        client.UserRole.ADMIN,
        client.UserRole.PROJECT_MANAGER,
    )
    update(
        @Param('id') id: string,
        @Body() dto: UpdateMasterContractDto,
        @CurrentUser() user: client.User,
    ) {
        return this.masterContractService.update(id, dto);
    }

    @Delete(':id')
    @Roles(
        client.UserRole.SUPER_ADMIN,
        client.UserRole.ADMIN,
        client.UserRole.PROJECT_MANAGER,
    )
    delete(@Param('id') id: string, @CurrentUser() user: client.User) {
        return this.masterContractService.delete(id);
    }

    // ──── Seed default contract articles ────

    @Post('seed')
    @Roles(
        client.UserRole.SUPER_ADMIN,
        client.UserRole.ADMIN,
    )
    seed(@CurrentUser() user: client.User) {
        return this.masterContractService.seedDefaults();
    }

    // ──── Client signs contract ────

    @Patch('sign/:proposalId')
    signContract(
        @Param('proposalId') proposalId: string,
        @Body() dto: ClientSignContractDto,
        @CurrentUser() user: client.User,
    ) {
        return this.masterContractService.clientSignContract(proposalId, dto, user);
    }

    // ──── Get contract for a proposal ────

    @Get('proposal/:proposalId')
    getContractForProposal(
        @Param('proposalId') proposalId: string,
        @CurrentUser() user: client.User,
    ) {
        return this.masterContractService.getContractForProposal(proposalId, user);
    }
}
