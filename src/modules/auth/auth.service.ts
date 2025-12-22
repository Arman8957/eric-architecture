// modules/auth/auth.service.ts
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
// import { UserRole } from 'generated/prisma';

import { UserRole, User } from '@prisma/client';
// import { UserRole } from 'generated/prisma'; // ← Use Prisma enum
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterStaffDto } from './dto/register-staff.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { MailerService } from 'src/utils/email/email.service';
// import { User } from 'generated/prisma'; // ← Prisma User type

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly emailVerifyExpiry: number;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mailer: MailerService,
  ) {
    this.emailVerifyExpiry = parseInt(this.config.get('EMAIL_VERIFY_EXPIRY', '24')) * 60 * 60 * 1000;
  }

  private async generateTokens(userId: string) {
    const [access, refresh] = await Promise.all([
      this.jwt.signAsync({ sub: userId }, {
        secret: this.config.get('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES'),
      }),
      this.jwt.signAsync({ sub: userId }, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES'),
      }),
    ]);
    return { access, refresh };
  }

  private async hashRefreshToken(token: string) {
    return bcrypt.hash(token, 12);
  }

  private async generateEmailVerifyToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  private async sendVerificationEmail(user: User, frontendUrl: string) {
    const token = await this.generateEmailVerifyToken();
    const expiry = new Date(Date.now() + this.emailVerifyExpiry);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: token, emailVerifyExpiry: expiry },
    });

    const verifyUrl = `${frontendUrl}/verify-email`;
    await this.mailer.sendEmailVerification(user.email, token, user.name ?? 'User', verifyUrl);
  }

  private sanitizeUser(user: User) {
    const { password, refreshToken, emailVerifyToken, emailVerifyExpiry, ...safe } = user;
    return safe;
  }

  async registerUser(dto: RegisterUserDto, frontendUrl: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) {
      throw new BadRequestException(existing.emailVerified
        ? 'Email already registered and verified.'
        : 'Email already registered. Check your inbox or resend verification.');
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name?.trim() ?? undefined, // ← Fixed null → undefined
        password: hashed,
        role: UserRole.USER,
        emailVerified: false,
      },
    });

    try {
      await this.sendVerificationEmail(user, frontendUrl);
      return { message: 'Registration successful! Please verify your email.', user: this.sanitizeUser(user) };
    } catch (error) {
      await this.prisma.user.delete({ where: { id: user.id } });
      throw new BadRequestException('Failed to send verification email. Try again later.');
    }
  }

  async registerStaff(dto: RegisterStaffDto, requestingUser: User, frontendUrl: string) {

//    if (![UserRole.SUPER_ADMIN, UserRole.ADMIN].includes(requestingUser.role)) {
//       throw new ForbiddenException('Only ADMIN or SUPER_ADMIN can create staff accounts.');
//     }

    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot create SUPER_ADMIN via staff registration.');
    }

    const allowedRoles = [
      UserRole.ADMIN,
      UserRole.FINANCE,
      UserRole.HIGHER_MANAGER,
      UserRole.CRAFTER,
      UserRole.EMPLOYEE,
      UserRole.USER,
    ];

    if (!allowedRoles.includes(dto.role)) {
      throw new BadRequestException('Invalid role for staff creation.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new BadRequestException('Email already registered.');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name?.trim() ?? undefined, // ← Fixed null → undefined
        password: hashed,
        role: dto.role,
        emailVerified: false,
      },
    });

    await this.sendVerificationEmail(user, frontendUrl);
    this.logger.log(`Staff created: ${user.email} (${dto.role}) by ${requestingUser.email}`);

    return { message: `Staff account created (${dto.role}). Verification email sent.`, user: this.sanitizeUser(user) };
  }

  async registerSuperAdmin(dto: RegisterUserDto, frontendUrl: string, requestingUser?: User) {
    if (requestingUser && requestingUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Only SUPER_ADMIN can create another SUPER_ADMIN.');
    }
    if (!requestingUser) {
      const count = await this.prisma.user.count({ where: { role: UserRole.SUPER_ADMIN } });
      if (count > 0) throw new ForbiddenException('SUPER_ADMIN already exists.');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new BadRequestException('Email already registered.');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name?.trim() ?? undefined, // ← Fixed
        password: hashed,
        role: UserRole.SUPER_ADMIN,
        emailVerified: false,
      },
    });

    await this.sendVerificationEmail(user, frontendUrl);
    return { message: 'SUPER_ADMIN created. Please verify email.', user: this.sanitizeUser(user) };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerifyToken: dto.token,
        emailVerifyExpiry: { gt: new Date() },
        emailVerified: false,
      },
    });
    if (!user) throw new BadRequestException('Invalid or expired token.');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null },
    });

    return { message: 'Email verified! You can now log in.' };
  }

  async login(email: string, password: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.emailVerified) {
      throw new UnauthorizedException('Invalid credentials or unverified email.');
    }
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user);
  }

  async refresh(token: string): Promise<AuthResponseDto> {
    const payload = await this.jwt.verifyAsync(token, { secret: this.config.get('JWT_REFRESH_SECRET') });
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.refreshToken || !(await bcrypt.compare(token, user.refreshToken))) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    return this.issueTokens(user);
  }

async issueTokens(user: User): Promise<AuthResponseDto> {
    const { access, refresh } = await this.generateTokens(user.id);
    const hashed = await this.hashRefreshToken(refresh);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashed },
    });

    return {
      accessToken: access,
      refreshToken: refresh,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || null, // ← Same type, no error
        avatar: user.avatar || null,
        isEmailVerified: user.emailVerified,
      },
    };
  }

  async validateOrCreateGoogleUser(data: { email: string; googleId: string; name?: string }): Promise<User> {
    let user = await this.prisma.user.findUnique({ where: { googleId: data.googleId } });

    if (!user) {
      user = await this.prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    }

    if (user) {
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: data.googleId },
        });
      }
      if (!user.emailVerified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          name: data.name?.trim() ?? undefined,
          googleId: data.googleId,
          role: UserRole.USER,
          emailVerified: true,
        },
      });
    }

    return user;
  }

  async resendVerification(email: string, frontendUrl: string) {
    // Add this method if missing
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new BadRequestException('No account found with this email.');
    if (user.emailVerified) throw new BadRequestException('Email already verified.');

    await this.sendVerificationEmail(user, frontendUrl);
    return { message: 'Verification email resent.' };
  }



  async logout(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
    return { message: 'Logged out successfully' };
  }
}