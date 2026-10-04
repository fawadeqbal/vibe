import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES = 'roles';

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES, roles);
