/**
 * Creates the first admin-panel owner if there is no staff yet.
 *
 *   ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a-long-passphrase-1' npm run db:seed
 *
 * (or set both in .env). The password must be changed at first sign-in.
 * Safe to run repeatedly: once any staff exists it does nothing — invite
 * more people from Team in the panel.
 */
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

import { hashPassword, passwordProblem } from '../src/common/utils/password';
import { SYSTEM_ROLES } from '../src/modules/admin/core/permissions';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Built-in roles (the API also syncs these at boot).
  for (const r of SYSTEM_ROLES) {
    await prisma.staffRole.upsert({
      where: { key: r.key },
      create: { key: r.key, name: r.name, description: r.description, permissions: r.permissions, system: true },
      update: { name: r.name, description: r.description, permissions: r.permissions, system: true },
    });
  }

  if ((await prisma.staffUser.count()) > 0) {
    console.log('Staff already exists; nothing to do. Invite people from Team in the admin panel.');
    return;
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('Set ADMIN_EMAIL and ADMIN_PASSWORD to create the first owner.');
    return;
  }
  const problem = passwordProblem(password);
  if (problem) throw new Error(`ADMIN_PASSWORD: ${problem}`);
  const owner = await prisma.staffRole.findUniqueOrThrow({ where: { key: 'owner' } });
  const s = await prisma.staffUser.create({ data: { email, name: 'Owner', passwordHash: await hashPassword(password), roleId: owner.id, mustChangePassword: true } });
  console.log(`Owner ready: ${s.email}. Sign in to the admin panel; you'll be asked to choose a new password.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
