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
import { JwtAuthGuard } from '../../common/guards/auth.guard'; // ← Correct guard
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator'; // ← Fixed import
// import { UserRole } from 'generated/prisma';
import * as client from '@prisma/client';
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterStaffDto } from './dto/register-staff.dto'; // ← Use RegisterStaffDto instead of RegisterAdminDto
import { VerifyEmailDto } from './dto/verify-email.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';

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

  // @Post('register-super-admin')
  // @Public() // Allows first-time registration without login
  // @HttpCode(HttpStatus.CREATED)
  // @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  // async registerSuperAdmin(
  //   @Body() dto: RegisterSuperAdminDto,
  //   @Req() req: Request,
  // ) {
  //   try {
  //     const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  //     const requestingUser = req.user; // optional, only if logged in
  //     const result = await this.authService.registerSuperAdmin(
  //       dto,
  //       frontendUrl,
  //       requestingUser,
  //     );

  //     return {
  //       success: true,
  //       message: result.message,
  //       user: result.user,
  //     };
  //   } catch (error) {
  //     // Handle known NestJS exceptions
  //     if (
  //       error instanceof ForbiddenException ||
  //       error instanceof BadRequestException
  //     ) {
  //       throw error;
  //     }

  //     // Log unknown errors
  //     console.error('registerSuperAdmin error:', error);

  //     // Generic server error
  //     throw new InternalServerErrorException('Internal server error');
  //   }
  // }

  @Post('staff/register') // ← Renamed to /staff/register (cleaner than /admin/register)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(client.UserRole.SUPER_ADMIN, client.UserRole.ADMIN)
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

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto, // ✅ Use DTO instead of individual @Body params
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

  //// all get controllers 

  
}
