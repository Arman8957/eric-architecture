import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    this.logger.log(`Required roles from decorator: ${JSON.stringify(requiredRoles)}`);

    if (!requiredRoles || requiredRoles.length === 0) {
      this.logger.log('No roles required → access granted');
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    this.logger.log(`User from request: ${JSON.stringify(user)}`);
    this.logger.log(`User role: ${user?.role} (type: ${typeof user?.role})`);

    if (!user || !user.role) {
      this.logger.warn('No user or role found in request → denied');
      throw new ForbiddenException('Access denied');
    }

    const hasRole = requiredRoles.includes(user.role);
    this.logger.log(`Role check result: ${hasRole} (required: ${requiredRoles}, actual: ${user.role})`);

    if (!hasRole) {
      this.logger.warn(`Insufficient permissions. Required: ${requiredRoles}, Got: ${user.role}`);
      throw new ForbiddenException('Insufficient permissions');
    }

    this.logger.log('Role check passed → access granted');
    return true;
  }
}