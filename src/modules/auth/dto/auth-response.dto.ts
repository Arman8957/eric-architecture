import { UserRole } from '@prisma/client';

export class AuthResponseDto {
  accessToken!: string;
  refreshToken!: string;
  user!: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole;
    avatar?: string | null; // Optional for consistency
    isEmailVerified: boolean;
  };
}