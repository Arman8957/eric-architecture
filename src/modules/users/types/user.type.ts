import { UserRole } from "@prisma/client";

export type SafeUser = {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date | null;
  emailVerified: boolean;
};