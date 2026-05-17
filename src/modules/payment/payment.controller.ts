import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  Param,
  Headers,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { StripeService } from './stripe.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import * as client from '@prisma/client';
import { Request } from 'express';

@Controller('payments')
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly stripeService: StripeService,
  ) {}

  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser() user: client.User,
  ) {
    const result = await this.paymentService.createCheckout(dto, user);
    return { success: true, data: result };
  }

  @Post('create-consultation-intent')
  @UseGuards(JwtAuthGuard)
  async createConsultationIntent(@CurrentUser() user: client.User) {
    const result = await this.paymentService.createConsultationIntent(user);
    return { success: true, data: result };
  }

  @Post('webhook')
  async handleWebhook(
    @Req() req: any,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody) {
      return { received: false, error: 'Raw body not available' };
    }
    try {
      const event = this.stripeService.constructWebhookEvent(
        req.rawBody,
        signature,
      );
      await this.paymentService.handleWebhookEvent(event);
      return { received: true };
    } catch (err) {
      const error = err as Error;
      return { received: false, error: error.message };
    }
  }

  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard)
  async confirmPayment(
    @Param('id') id: string,
    @CurrentUser() user: client.User,
  ) {
    const result = await this.paymentService.confirmPayment(id, user.id);
    return { success: true, data: result };
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyPayments(@CurrentUser() user: client.User) {
    const data = await this.paymentService.getMyPayments(user.id);
    return { success: true, data };
  }

  @Get('status/:projectRequestId')
  @UseGuards(JwtAuthGuard)
  async getPaymentStatus(
    @Param('projectRequestId') projectRequestId: string,
    @CurrentUser() user: client.User,
  ) {
    const data = await this.paymentService.getPaymentStatus(projectRequestId, user.id);
    return { success: true, data };
  }

  @Get('project/:projectRequestId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    client.UserRole.SUPER_ADMIN,
    client.UserRole.ADMIN,
    client.UserRole.FINANCE,
  )
  async getProjectPayments(
    @Param('projectRequestId') projectRequestId: string,
  ) {
    const data = await this.paymentService.getProjectPayments(projectRequestId);
    return { success: true, data };
  }
}
