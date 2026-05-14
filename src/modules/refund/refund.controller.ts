import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { RefundService } from './refund.service';
import { CreateRefundDto } from './dto/create-refund.dto';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';

@Controller('refunds')
@UseGuards(JwtAuthGuard)
export class RefundController {
  constructor(private readonly refundService: RefundService) {}

  @Post()
  async createRefundRequest(
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: client.User,
  ) {
    const result = await this.refundService.createRefundRequest(dto, user);
    return { success: true, message: 'Refund request submitted', data: result };
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.FINANCE,
    client.UserRole.PROJECT_MANAGER,
  )
  async getAllRefundRequests() {
    const data = await this.refundService.getAllRefundRequests();
    return { success: true, data };
  }

  @Get('my')
  async getMyRefundRequests(@CurrentUser() user: client.User) {
    const data = await this.refundService.getMyRefundRequests(user.id);
    return { success: true, data };
  }

  @Get('bank-details')
  async getUserBankDetails(@CurrentUser() user: client.User) {
    const data = await this.refundService.getUserBankDetails(user.id);
    return { success: true, data };
  }

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.FINANCE,
  )
  async approveRefund(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    const result = await this.refundService.approveRefund(id, user);
    return { success: true, message: 'Refund approved', data: result };
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.FINANCE,
  )
  async rejectRefund(
    @Param('id') id: string,
    @Body() body: { rejectionReason?: string },
    @CurrentUser() user: client.User,
  ) {
    const result = await this.refundService.rejectRefund(id, user, body.rejectionReason);
    return { success: true, message: 'Refund rejected', data: result };
  }
}
