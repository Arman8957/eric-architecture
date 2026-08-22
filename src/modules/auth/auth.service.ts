// modules/auth/auth.service.ts
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UserRole, User, Prisma } from '@prisma/client';
import { RegisterUserDto } from './dto/register-user.dto';
import { RegisterStaffDto } from './dto/register-staff.dto';
import { RegisterSuperAdminDto } from './dto/register-super-admin.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { MailerService } from 'src/utils/email/email.service';
import { FindAllOptions } from './constant';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly emailVerifyExpiry: number;
  private readonly passwordResetExpiry: number;

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mailer: MailerService,
  ) {
    this.emailVerifyExpiry =
      parseInt(this.config.get('EMAIL_VERIFY_EXPIRY', '24')) * 60 * 60 * 1000;
    // The reset email tells the recipient the link lasts 1 hour.
    this.passwordResetExpiry =
      parseInt(this.config.get('PASSWORD_RESET_EXPIRY', '1')) * 60 * 60 * 1000;
  }

  private async generateTokens(userId: string, role: UserRole) {
    const [access, refresh] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, role: role },
        {
          secret: this.config.get('JWT_ACCESS_SECRET'),
          expiresIn: this.config.get('JWT_ACCESS_EXPIRES'),
        },
      ),
      this.jwt.signAsync(
        { sub: userId, role: role },
        {
          secret: this.config.get('JWT_REFRESH_SECRET'),
          expiresIn: this.config.get('JWT_REFRESH_EXPIRES'),
        },
      ),
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

    await this.mailer.sendEmailVerification(
      user.email,
      token,
      user.name ?? 'User',
      // verifyUrl,
      frontendUrl,
    );
  }

  private sanitizeUser(user: User) {
    const {
      password,
      refreshToken,
      emailVerifyToken,
      emailVerifyExpiry,
      ...safe
    } = user;
    return safe;
  }

  async registerUser(dto: RegisterUserDto, frontendUrl: string) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new BadRequestException(
        existing.emailVerified
          ? 'Email already registered and verified.'
          : 'Email already registered. Check your inbox or resend verification.',
      );
    }

    const optional = (value?: string) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : undefined;
    };

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: dto.name?.trim() ?? undefined,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        country: optional(dto.country),
        stateRegion: optional(dto.state),
        city: optional(dto.city),
        streetAddress: optional(dto.streetAddress),
        zipCode: optional(dto.zipCode),
        password: hashed,
        role: UserRole.USER,
        emailVerified: false,
      },
    });

    try {
      await this.sendVerificationEmail(user, frontendUrl);
      return {
        message: 'Registration successful! Please verify your email.',
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      await this.prisma.user.delete({ where: { id: user.id } });
      throw new BadRequestException(
        'Failed to send verification email. Try again later.',
      );
    }
  }

  async registerStaff(
    dto: RegisterStaffDto,
    requestingUser: User,
    frontendUrl: string,
  ) {
    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        'Cannot create SUPER_ADMIN via staff registration.',
      );
    }

    const allowedRoles = [
      UserRole.ADMIN,
      UserRole.FINANCE,
      UserRole.HIGHER_MANAGER,
      UserRole.PROJECT_MANAGER,
      UserRole.DRAFTER,
      UserRole.EMPLOYEE,
      UserRole.USER,
      UserRole.MEDIA_MANAGER,
    ];

    if (!allowedRoles.includes(dto.role)) {
      throw new BadRequestException('Invalid role for staff creation.');
    }

    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) throw new BadRequestException('Email already registered.');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: dto.name?.trim() ?? undefined,
        password: hashed,
        role: dto.role,
        emailVerified: false,
        // The Add Team Member form collects these; they were previously
        // dropped, leaving a new staff member with no address on file.
        phoneNumber: dto.phoneNumber ?? dto.phone ?? undefined,
        streetAddress: dto.streetAddress ?? dto.address ?? undefined,
        city: dto.city ?? undefined,
        stateRegion: dto.stateRegion ?? undefined,
        zipCode: dto.zipCode ?? undefined,
        country: dto.country ?? undefined,
        employeeProfile: {
          create: {
            employeeId: `EMP-${Date.now()}`,
            phone: dto.phoneNumber ?? dto.phone,
            address: dto.streetAddress ?? dto.address,
          },
        },
      },
    });

    await this.sendVerificationEmail(user, frontendUrl);
    this.logger.log(
      `Staff created: ${user.email} (${dto.role}) by ${requestingUser.email}`,
    );

    return {
      message: `Staff account created (${dto.role}). Verification email sent.`,
      user: this.sanitizeUser(user),
    };
  }

  async registerSuperAdmin(
    dto: RegisterSuperAdminDto,
    frontendUrl: string,
    requestingUser?: User,
  ) {
    if (requestingUser && requestingUser.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can create another SUPER_ADMIN.',
      );
    }
    if (!requestingUser) {
      const count = await this.prisma.user.count({
        where: { role: UserRole.SUPER_ADMIN },
      });
      if (count > 0)
        throw new ForbiddenException('SUPER_ADMIN already exists.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new BadRequestException('Email already registered.');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name?.trim() ?? undefined,
        password: hashed,
        role: UserRole.SUPER_ADMIN,
        emailVerified: false,
      },
    });

    await this.sendVerificationEmail(user, frontendUrl);
    return {
      message: 'SUPER_ADMIN created. Please verify email.',
      user: this.sanitizeUser(user),
    };
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
      data: {
        emailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });

    return { message: 'Email verified! You can now log in.' };
  }

  /**
   * Start the "forgot password" flow. The response is intentionally identical
   * whether or not the address is registered — otherwise this endpoint doubles
   * as an account-enumeration oracle.
   */
  async forgotPassword(email: string, frontendUrl: string) {
    const genericMessage =
      'If an account exists for that email, a password reset link has been sent.';

    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // OAuth-only accounts have no password to reset.
    if (!user || !user.isActive || !user.password) {
      return { message: genericMessage };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + this.passwordResetExpiry);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    try {
      await this.mailer.sendPasswordReset(
        user.email,
        token,
        user.name ?? user.firstName ?? 'User',
        `${frontendUrl.replace(/\/$/, '')}/resetPassword`,
      );
    } catch (error) {
      // Don't leave a live token behind on a mail failure.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: null, passwordResetExpiry: null },
      });
      this.logger.error(`Failed to send password reset email to ${user.email}`, error);
      throw new InternalServerErrorException(
        'Could not send the reset email. Please try again later.',
      );
    }

    this.logger.log(`Password reset requested for ${user.email}`);
    return { message: genericMessage };
  }

  /**
   * Complete the flow. Consumes the token, sets the new password and drops any
   * live refresh token so existing sessions can't outlive the reset.
   */
  async resetPassword(token: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('This reset link is invalid or has expired.');
    }

    const hashed = await bcrypt.hash(password, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshToken: null,
        // A reset over a verified email address proves ownership.
        emailVerified: true,
      },
    });

    this.logger.log(`Password reset completed for ${user.email}`);
    return { message: 'Password updated. You can now log in.' };
  }

  async login(email: string, password: string): Promise<AuthResponseDto> {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }

    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user);
  }

  async refresh(token: string): Promise<AuthResponseDto> {
    const payload = await this.jwt.verifyAsync(token, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
    });
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (
      !user ||
      !user.refreshToken ||
      !(await bcrypt.compare(token, user.refreshToken))
    ) {
      throw new UnauthorizedException('Invalid refresh token.');
    }
    return this.issueTokens(user);
  }

  async issueTokens(user: User): Promise<AuthResponseDto> {
    const { access, refresh } = await this.generateTokens(user.id, user.role);
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
        role: user.role,
        avatar: user.avatar || null,
        isEmailVerified: user.emailVerified,

        // Profile details, including anything supplied at sign-up. The client
        // replaces its stored user with this payload on every login, so
        // omitting these blanked out Profile Settings after each sign-in.
        firstName: user.firstName,
        middleInitial: user.middleInitial,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        companyName: user.companyName,
        bio: user.bio,
        streetAddress: user.streetAddress,
        city: user.city,
        stateRegion: user.stateRegion,
        zipCode: user.zipCode,
        country: user.country,
      },
    };
  }

  async validateOrCreateGoogleUser(data: {
    email: string;
    googleId: string;
    name?: string;
  }): Promise<User> {
    let user = await this.prisma.user.findUnique({
      where: { googleId: data.googleId },
    });

    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email: data.email.toLowerCase() },
      });
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
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user)
      throw new BadRequestException('No account found with this email.');
    if (user.emailVerified)
      throw new BadRequestException('Email already verified.');

    await this.sendVerificationEmail(user, frontendUrl);
    return { message: 'Verification email resent.' };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: 'Logged out successfully' };
  }


}
