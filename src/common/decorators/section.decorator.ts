import { SetMetadata } from '@nestjs/common';

/** The areas of the staff dashboard, mirroring DashboardSection on the client. */
export type DashboardSection = 'studio' | 'media' | 'financials';

export const SECTION_KEY = 'dashboardSection';

/**
 * Marks a route as belonging to one area of the staff dashboard.
 *
 * Only EMPLOYEE accounts are checked against it — see SectionGuard. Every other
 * role's access is settled by `@Roles` alone, because their role already says
 * which areas they work in.
 */
export const Section = (section: DashboardSection) =>
  SetMetadata(SECTION_KEY, section);
