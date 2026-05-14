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
    CreateAmendmentContractDto,
    UpdateAmendmentContractDto,
} from './dto/amendment-contract.dto';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { AmendmentContractService } from './amendment-contract.service';

@Controller('amendment-contract')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AmendmentContractController {
    constructor(
        private readonly amendmentContractService: AmendmentContractService,
    ) { }

    @Get()
    findAll() {
        return this.amendmentContractService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.amendmentContractService.findOne(id);
    }

    @Post()
    @Roles(
        client.UserRole.SUPER_ADMIN,
        client.UserRole.ADMIN,
        client.UserRole.PROJECT_MANAGER,
    )
    create(
        @Body() dto: CreateAmendmentContractDto,
        @CurrentUser() user: client.User,
    ) {
        return this.amendmentContractService.create(dto);
    }

    @Patch(':id')
    @Roles(
        client.UserRole.SUPER_ADMIN,
        client.UserRole.ADMIN,
        client.UserRole.PROJECT_MANAGER,
    )
    update(
        @Param('id') id: string,
        @Body() dto: UpdateAmendmentContractDto,
        @CurrentUser() user: client.User,
    ) {
        return this.amendmentContractService.update(id, dto);
    }

    @Delete(':id')
    @Roles(
        client.UserRole.SUPER_ADMIN,
        client.UserRole.ADMIN,
        client.UserRole.PROJECT_MANAGER,
    )
    delete(@Param('id') id: string, @CurrentUser() user: client.User) {
        return this.amendmentContractService.delete(id);
    }

    @Post('seed')
    @Roles(
        client.UserRole.SUPER_ADMIN,
        client.UserRole.ADMIN,
    )
    seed(@CurrentUser() user: client.User) {
        return this.amendmentContractService.seedDefaults();
    }
}
