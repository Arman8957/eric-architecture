// modules/auth/dto/auth-response.dto.ts
import { UserRole } from '@prisma/client';

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