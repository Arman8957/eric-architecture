import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { SECTION_KEY, DashboardSection } from '../decorators/section.decorator';

/**
 * Enforces an employee's per-account dashboard grant.
 *
 * An EMPLOYEE's access is not settled by their role: two employees with the
 * same role can be given different areas, ticked one by one when the account is
 * made. `@Roles` cannot express that, so a route that admits EMPLOYEE at all
 * would otherwise admit every employee — including one who was only ever meant
 * to see the studio reading payroll.
 *
 * So this pairs with `@Roles`, never replaces it: the role check says which
 * roles may reach the route, and this narrows EMPLOYEE to those who hold the
 * area. Any other role passes straight through, because their role has already
 * answered the question. A route with no `@Section` is unaffected.
 */
@Injectable()
export class SectionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const section = this.reflector.getAllAndOverride<DashboardSection>(
      SECTION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!section) return true;

    const user = context.switchToHttp().getRequest().user;
    if (!user) throw new ForbiddenException('Access denied');

    if (user.role !== UserRole.EMPLOYEE) return true;

    const granted: string[] = user.dashboardSections ?? [];
    if (!granted.includes(section)) {
      throw new ForbiddenException(
        `Your account has not been given access to ${section}.`,
      );
    }

    return true;
  }
}
