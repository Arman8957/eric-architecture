// modules/auth/dto/auth-response.dto.ts
import { UserRole, User } from '../../../generated/prisma';// ← Use Prisma enum (critical)

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole; // ← Now matches user.role from Prisma exactly
    avatar?: string | null; // Optional for consistency
    isEmailVerified: boolean;
  };
}