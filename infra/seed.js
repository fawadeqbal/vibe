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
  const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  
  console.log('Creating owner:', email);
  
  const owner = await prisma.staffRole.findUniqueOrThrow({ where: { key: 'owner' } });
  
  const existing = await prisma.staffUser.count();
  if (existing > 0) {
    console.log('Staff already exists; nothing to do.');
    return;
  }
  
  const s = await prisma.staffUser.create({ 
    data: { 
      email, 
      name: 'Owner', 
      passwordHash: hashPassword(password), 
      roleId: owner.id, 
      mustChangePassword: true 
    } 
  });
  console.log(`Owner ready: ${s.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
