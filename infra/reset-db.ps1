# Wipes the PRODUCTION database and creates the staff accounts again.
#
#   powershell -ExecutionPolicy Bypass -File infra\reset-db.ps1
#   powershell -ExecutionPolicy Bypass -File infra\reset-db.ps1 -ResetSettings   # also reset prices/settings/mail templates
#
# 1. Backs up the whole database to /opt/vibe/backups/vibe-<time>.sql.gz on the server.
# 2. Empties every table (users, wallets, payments, matches, referrals, staff, audit log...).
#    Kept: migrations, staff roles, and (unless -ResetSettings) AppSetting (economy prices,
#    fee rates, runtime settings) and MailTemplate.
# 3. Flushes Redis (sessions, caches, rate limits) and restarts the API.
# 4. Creates one staff account per role: the owner is ADMIN_EMAIL, the rest <role>@vibe.local.
#    All get ADMIN_PASSWORD from the server .env and must change it at first sign-in.
#
# Restore a backup:  gunzip -c /opt/vibe/backups/<file>.sql.gz | docker exec -i vibe-postgres psql -U vibe -d vibe
param([switch]$ResetSettings)

$ErrorActionPreference = "Stop"
$key = "$PSScriptRoot\..\..\..\..\Kids Coding Platform\repo\scripts\ssh-key-2026-10-02.key"
$server = "opc@145.241.156.60"

Write-Host "This DELETES all users, payments, chats and staff on $server (a backup is taken first)." -ForegroundColor Red
if ($ResetSettings) { Write-Host "Prices, settings and mail templates are reset to defaults too." -ForegroundColor Red }
$answer = Read-Host "Type RESET to continue"
if ($answer -cne "RESET") { Write-Host "Cancelled."; exit 1 }

$keepExtra = if ($ResetSettings) { "" } else { ",'AppSetting','MailTemplate'" }

$script = @'
set -euo pipefail
cd /opt/vibe

TS=$(date +%Y%m%d-%H%M%S)
mkdir -p backups
echo "[1/4] Backing up the database..."
docker exec vibe-postgres pg_dump -U vibe -d vibe | gzip > "backups/vibe-$TS.sql.gz"
[ -s "backups/vibe-$TS.sql.gz" ] || { echo "Backup is empty, stopping." >&2; exit 1; }
echo "      /opt/vibe/backups/vibe-$TS.sql.gz ($(du -h "backups/vibe-$TS.sql.gz" | cut -f1))"

echo "[2/4] Emptying tables..."
docker exec -i vibe-postgres psql -U vibe -d vibe -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$
DECLARE t text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO t
    FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'StaffRole'__KEEP_EXTRA__);
  IF t IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ' || t || ' RESTART IDENTITY CASCADE'; END IF;
END
\$\$;
DO \$\$ BEGIN
  IF to_regclass('public."AppSetting"') IS NOT NULL THEN UPDATE "AppSetting" SET "updatedById" = NULL; END IF;
  IF to_regclass('public."MailTemplate"') IS NOT NULL THEN UPDATE "MailTemplate" SET "updatedById" = NULL; END IF;
END \$\$;
SQL
docker exec vibe-postgres psql -U vibe -d vibe -tAc 'SELECT COUNT(*) || $$ users, $$ FROM "User"' | tr -d '\n'
docker exec vibe-postgres psql -U vibe -d vibe -tAc 'SELECT COUNT(*) || $$ staff left$$ FROM "StaffUser"'

echo "[3/4] Flushing Redis and restarting the API..."
docker exec vibe-redis redis-cli FLUSHALL > /dev/null
docker compose restart vibe-api > /dev/null
for i in $(seq 1 60); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' vibe-api)" = "healthy" ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' vibe-api)" = "healthy" ] || { echo "API did not come back healthy; check: docker compose logs vibe-api" >&2; exit 1; }

echo "[4/4] Creating staff accounts..."
ADMIN_EMAIL=$(grep -m1 '^ADMIN_EMAIL=' .env | cut -d= -f2- | tr -d '"'"'"'\r')
ADMIN_PASSWORD=$(grep -m1 '^ADMIN_PASSWORD=' .env | cut -d= -f2- | tr -d '"'"'"'\r')
[ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ] || { echo "ADMIN_EMAIL / ADMIN_PASSWORD missing in /opt/vibe/.env" >&2; exit 1; }
docker exec -i -w /app -e ADMIN_EMAIL="$ADMIN_EMAIL" -e ADMIN_PASSWORD="$ADMIN_PASSWORD" vibe-api node - <<'JS'
const { PrismaClient } = require('@prisma/client');
const { randomBytes, scryptSync } = require('node:crypto');
const prisma = new PrismaClient();
// Same format as backend/src/common/utils/password.ts.
const PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const hash = (pw) => {
  const salt = randomBytes(16);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), scryptSync(pw, salt, 32, PARAMS).toString('base64url')].join('$');
};
(async () => {
  const password = process.env.ADMIN_PASSWORD;
  if (password.length < 10 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) throw new Error('ADMIN_PASSWORD needs 10+ characters with letters and digits');
  const roles = await prisma.staffRole.findMany({ orderBy: { createdAt: 'asc' } });
  if (!roles.some((r) => r.key === 'owner')) throw new Error('No owner role; the API should create it at start-up');
  for (const role of roles) {
    const email = role.key === 'owner' ? process.env.ADMIN_EMAIL.trim().toLowerCase() : `${role.key}@vibe.local`;
    await prisma.staffUser.upsert({
      where: { email },
      update: {},
      create: { email, name: role.key === 'owner' ? 'Owner' : role.name, passwordHash: hash(password), roleId: role.id, mustChangePassword: true },
    });
    console.log(`      ${role.name.padEnd(12)} ${email}`);
  }
})()
  .catch((e) => { console.error(e.message || e); process.exit(1); })
  .finally(() => prisma.$disconnect());
JS
echo "Done. Sign in with the emails above and ADMIN_PASSWORD from infra/.env.prod; each account must set a new password."
'@

$script = $script.Replace("__KEEP_EXTRA__", $keepExtra) -replace "`r", ""
# Base64 so Windows PowerShell doesn't strip the quotes in the shell code.
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script))
ssh -i $key -o StrictHostKeyChecking=no $server "echo $b64 | base64 -d | bash"
if ($LASTEXITCODE -ne 0) { Write-Host "Reset FAILED (exit $LASTEXITCODE). The backup in /opt/vibe/backups is safe." -ForegroundColor Red; exit $LASTEXITCODE }
Write-Host "Database reset complete." -ForegroundColor Green
