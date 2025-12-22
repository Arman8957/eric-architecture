// modules/auth/google/google.controller.ts
import { Controller, Get, UseGuards, Req, Res, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import express from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthService } from '../auth.service';
import {  User } from '@prisma/client';

@Controller('auth/google')
export class GoogleController {
  private readonly logger = new Logger(GoogleController.name);
  private readonly frontendUrl: string;

  constructor(
    private config: ConfigService,
    private authService: AuthService,
  ) {
    this.frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
  }

  @Get()
  @Public()
  @UseGuards(AuthGuard('google'))
  googleAuth(@Req() req: express.Request) {
    // Initiates OAuth flow — Passport handles redirect
  }

  @Get('callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(
    @Req() req: express.Request & { user?: User }, // Proper typing instead of any
    @Res() res: express.Response,
  ) {
    const user = req.user;

    if (!user) {
      this.logger.warn('Google OAuth callback: No user attached');
      return res.redirect(`${this.frontendUrl}/login?error=google_auth_failed`);
    }

    try {
      const { accessToken, refreshToken } = await this.authService.issueTokens(user);

      const redirectUrl = new URL(this.frontendUrl);
      redirectUrl.pathname = '/auth/success'; // Optional: dedicated success page
      redirectUrl.searchParams.append('accessToken', accessToken);
      redirectUrl.searchParams.append('refreshToken', refreshToken);

      this.logger.log(`Google OAuth success for user: ${user.email}`);
      return res.redirect(redirectUrl.toString());
    } catch (error) {
      this.logger.error('Failed to issue tokens after Google login', error);
      return res.redirect(`${this.frontendUrl}/login?error=token_generation_failed`);
    }
  }
}