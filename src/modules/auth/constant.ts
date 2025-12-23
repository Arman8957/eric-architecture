import { UserRole } from "@prisma/client";

export interface FindAllOptions {
  page: number;
  take: number;
  roleFilter?: UserRole;
  search?: string;
  cursor?: string; 
}