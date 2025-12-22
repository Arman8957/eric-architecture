// modules/auth/google/google.strategy.ts
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(
    private config: ConfigService,
    private authService: AuthService,
  ) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: config.get<string>('GOOGLE_CALLBACK_URL')!,
      scope: ['email', 'profile'],
      passReqToCallback: false, // ← Explicitly set (default is false)
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;
      const googleId = profile.id;
      const name = profile.displayName;

      if (!email) {
        return done(new Error('No email found from Google'), false);
      }

      const user = await this.authService.validateOrCreateGoogleUser({
        email,
        googleId,
        name,
      });

      done(null, user); // ← Correct: user is Prisma User object
    } catch (error) {
      this.logger.error('Google OAuth validation failed:', error);
      done(error as Error, false);
    }
  }
}