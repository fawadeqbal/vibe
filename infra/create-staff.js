const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');

const prisma = new PrismaClient();

const PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

async function main() {
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe-2026';
  const hashed = hashPassword(password);
  
  const roles = await prisma.staffRole.findMany();
  
  for (const role of roles) {
    // Skip owner since it was already seeded
    if (role.key === 'owner') continue;
    
    const email = `${role.key}@vibe.local`;
    
    const existing = await prisma.staffUser.findUnique({ where: { email } });
    if (existing) {
      console.log(`Staff ${email} already exists.`);
      continue;
    }
    
    const s = await prisma.staffUser.create({ 
      data: { 
        email, 
        name: role.name, 
        passwordHash: hashed, 
        roleId: role.id, 
        mustChangePassword: true 
      } 
    });
    console.log(`Created staff account: ${s.email} for role ${role.name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
