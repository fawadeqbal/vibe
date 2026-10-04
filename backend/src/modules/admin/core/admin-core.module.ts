import { Global, Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';

import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { SYSTEM_ROLES } from './permissions';
import { StaffAuthGuard } from './staff-auth.guard';
import { StaffContextService } from './staff-context.service';
import { staffJwtProvider } from './staff-jwt';

/** Keeps the built-in roles in the database in step with `SYSTEM_ROLES`. */
@Injectable()
export class SystemRolesSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(SystemRolesSync.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contexts: StaffContextService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.sync();
  }

  async sync(): Promise<void> {
    for (const r of SYSTEM_ROLES) {
      const role = await this.prisma.staffRole.upsert({
        where: { key: r.key },
        create: { key: r.key, name: r.name, description: r.description, permissions: r.permissions, system: true },
        update: { name: r.name, description: r.description, permissions: r.permissions, system: true },
      });
      await this.contexts.invalidateRole(role.id);
    }
    this.logger.debug(`Synced ${SYSTEM_ROLES.length} system roles`);
  }
}

/** The back-office framework every admin feature module builds on. */
@Global()
@Module({
  providers: [staffJwtProvider, StaffContextService, AuditService, AuditInterceptor, StaffAuthGuard, SystemRolesSync],
  exports: [staffJwtProvider, StaffContextService, AuditService, AuditInterceptor, StaffAuthGuard, SystemRolesSync],
})
export class AdminCoreModule {}
