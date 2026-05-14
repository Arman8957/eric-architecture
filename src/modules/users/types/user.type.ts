import { UserRole, EmployeeProfile } from "@prisma/client";

export type SafeUser = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  emailVerified: boolean;
  employeeProfile?: EmployeeProfile | null;
};