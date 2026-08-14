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

    // Profile — the client stores this whole object and reads it back in
    // Profile Settings and when prefilling the New Project client step, so it
    // has to travel with the login/refresh response.
    firstName?: string | null;
    middleInitial?: string | null;
    lastName?: string | null;
    phoneNumber?: string | null;
    companyName?: string | null;
    bio?: string | null;
    streetAddress?: string | null;
    city?: string | null;
    stateRegion?: string | null;
    zipCode?: string | null;
    country?: string | null;
  };
}