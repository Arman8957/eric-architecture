// modules/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  Param,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import express from 'express';
import { AuthService } from './auth.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../../common/guards/auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import * as client from '@prisma/client';
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterStaffDto } from './dto/register-staff.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ProjectRequestService } from '../users/user-service/project-request.service';

interface AuthResponse {
  success: boolean;
  message: string;
  data?: any;
}

@Controller('auth')
export class AuthController {
  private readonly frontendUrl: string;

  constructor(
    private authService: AuthService,
    private config: ConfigService,
    private usersService: ProjectRequestService,
  ) {
    this.frontendUrl = this.config.get('FRONTEND_URL', 'http://localhost:3000');
  }

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterUserDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.registerUser(dto, this.frontendUrl);

    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: result.message,
      data: { user: result.user },
    });
  }

  @Post('register-super-admin')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async registerSuperAdmin(
    @Body() dto: RegisterSuperAdminDto,
    @Req() req: Request,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    return this.authService.registerSuperAdmin(dto, frontendUrl);
  }



  @Post('staff/register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN, client.UserRole.FINANCE)
  @HttpCode(HttpStatus.CREATED)
  async registerStaff(
    @Body() dto: RegisterStaffDto,
    @Req() req: express.Request & { user: any },
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.registerStaff(
      dto,
      req.user,
      this.frontendUrl,
    );

    return res.status(HttpStatus.CREATED).json({
      success: true,
      message: result.message,
      data: { user: result.user },
    });
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.verifyEmail(dto);

    return res.status(HttpStatus.OK).json({
      success: true,
      message: result.message,
    });
  }

  @Post('resend-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body('email') email: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.resendVerification(
      email,
      this.frontendUrl,
    );

    return res.status(HttpStatus.OK).json({
      success: true,
      message: result.message,
    });
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.forgotPassword(
      dto.email,
      this.frontendUrl,
    );

    return res.status(HttpStatus.OK).json({
      success: true,
      message: result.message,
    });
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.resetPassword(dto.token, dto.password);

    return res.status(HttpStatus.OK).json({
      success: true,
      message: result.message,
    });
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.login(dto.email, dto.password);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      },
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: express.Request & { user: { sub: string } },
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.logout(req.user.sub);

    res.clearCookie('refreshToken');

    return res.status(HttpStatus.OK).json({
      success: true,
      message: result.message,
    });
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body('refreshToken') token: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.refresh(token);

    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
      },
    });
  }


}
