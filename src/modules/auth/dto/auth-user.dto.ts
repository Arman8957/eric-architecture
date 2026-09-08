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
  /**
   * Which dashboard areas this account may open: "studio", "media",
   * "financials". Only meaningful for EMPLOYEE, whose access is ticked per
   * person; every other role's is fixed by the role itself. Carried on the
   * request so SectionGuard can enforce it — without it the server has no way
   * to tell one employee's grant from another's.
   */
  dashboardSections: string[];
}