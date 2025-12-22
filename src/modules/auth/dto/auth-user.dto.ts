// modules/auth/dto/auth-user.dto.ts
import { UserRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatar: string | null;
  isEmailVerified: boolean;
  isActive: boolean;
}