$ErrorActionPreference = "Stop"
$key = "$PSScriptRoot\..\..\..\..\Kids Coding Platform\repo\scripts\ssh-key-2026-10-02.key"
$server = "opc@145.241.156.60"
$vibeDir = "$PSScriptRoot\.."
$zipFile = "$vibeDir\vibe-deploy.zip"

# ssh/scp are native programs: "Stop" doesn't catch their failures, so check the exit code.
function Assert-Ok([string]$step) {
  if ($LASTEXITCODE -ne 0) { Write-Host "  FAILED: $step (exit code $LASTEXITCODE)" -ForegroundColor Red; exit 1 }
}

# Preflight: key present, and the TURN relay knows its public IP. Without
# TURN_EXTERNAL_IP coturn hands phones its private 10.0.0.x address and
# calls between different networks connect with no video.
if (-not (Test-Path $key)) { Write-Host "SSH key not found: $key" -ForegroundColor Red; exit 1 }
if (-not (Select-String -Path "$vibeDir\infra\.env.prod" -Pattern '^TURN_EXTERNAL_IP=\S' -Quiet)) {
  Write-Host "infra\.env.prod has no TURN_EXTERNAL_IP (e.g. 145.241.156.60/10.0.0.44). Aborting." -ForegroundColor Red; exit 1
}

Write-Host "=== Deploying Vibe to production ===" -ForegroundColor Cyan

# 1. Create directory on server
Write-Host "`n[1/6] Creating /opt/vibe on server..." -ForegroundColor Yellow
ssh -i $key -o StrictHostKeyChecking=no $server "sudo mkdir -p /opt/vibe && sudo chown -R opc:opc /opt/vibe"
Assert-Ok "connect to server"

# 2. Zip and upload as one file
Write-Host "`n[2/6] Zipping project (excluding node_modules, .git, dist)..." -ForegroundColor Yellow
if (Test-Path $zipFile) { Remove-Item $zipFile -Force }

$tempStaging = "$vibeDir\.deploy-staging"
if (Test-Path $tempStaging) { Remove-Item $tempStaging -Recurse -Force }
New-Item -ItemType Directory -Path $tempStaging | Out-Null

robocopy "$vibeDir\backend" "$tempStaging\backend" /E /XD node_modules dist .git /XF .env .env.local /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
robocopy "$vibeDir\admin" "$tempStaging\admin" /E /XD node_modules .next .git /XF .env .env.local /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
robocopy "$vibeDir\infra" "$tempStaging\infra" /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
Copy-Item "$vibeDir\infra\docker-compose.prod.yml" "$tempStaging\docker-compose.yml"
Copy-Item "$vibeDir\infra\.env.prod" "$tempStaging\.env.template"

Compress-Archive -Path "$tempStaging\*" -DestinationPath $zipFile -Force
Remove-Item $tempStaging -Recurse -Force

$sizeMB = [math]::Round((Get-Item $zipFile).Length / 1MB, 1)
Write-Host "  Zip created: $sizeMB MB" -ForegroundColor Green

Write-Host "`n[3/6] Uploading zip to server..." -ForegroundColor Yellow
scp -i $key -o StrictHostKeyChecking=no $zipFile "${server}:/opt/vibe/vibe-deploy.zip"
Assert-Ok "upload zip"
Remove-Item $zipFile -Force

# 4. Unzip, fix permissions, generate secrets
Write-Host "`n[4/6] Unpacking and generating production secrets..." -ForegroundColor Yellow
# Use sudo for rm because previous Docker builds may have left root-owned files
ssh -i $key -o StrictHostKeyChecking=no $server "cd /opt/vibe && sudo rm -rf backend admin docker-compose.yml ; unzip -o vibe-deploy.zip ; rm -f vibe-deploy.zip ; sudo chown -R opc:opc /opt/vibe ; chmod -R u+rwX,go+rX backend admin ; chmod +x infra/turn/*.sh ; sed -i 's/\r$//' infra/turn/*.sh infra/turn/turnserver.conf"
Assert-Ok "unpack on server"

# Migrate old secrets into the new .env and clean up the old standalone TURN server
$migrateScript = @'
cd /opt/vibe

# Stop and remove the old standalone TURN server if it exists
if [ -d /opt/vibe-turn ]; then
  cd /opt/vibe-turn
  sudo docker compose down 2>/dev/null || true
  cd /opt/vibe
  
  # Migrate certificates
  if [ -d /opt/vibe-turn/certs ]; then
    mkdir -p infra/turn/certs
    sudo cp -r /opt/vibe-turn/certs/* infra/turn/certs/ 2>/dev/null || true
    # Fix ownership so coturn (uid 65534) can read them
    sudo chown 65534 infra/turn/certs/*
    sudo chmod 600 infra/turn/certs/privkey.pem
  fi
fi

# Load old secrets if .env exists
OLD_DB_PASS="CHANGE_DB_PASSWORD"
OLD_JWT_ACCESS="CHANGE_ME_jwt_access_secret_production"
OLD_JWT_STAFF="CHANGE_ME_jwt_staff_secret_production"
OLD_WEBHOOK="CHANGE_ME_webhook_secret"

if [ -f .env ]; then
  OLD_DB_PASS=$(grep ^VIBE_DB_PASSWORD= .env | cut -d= -f2)
  OLD_JWT_ACCESS=$(grep ^JWT_ACCESS_SECRET= .env | cut -d= -f2)
  OLD_JWT_STAFF=$(grep ^JWT_STAFF_SECRET= .env | cut -d= -f2)
  OLD_WEBHOOK=$(grep ^PAYMENT_WEBHOOK_SECRET= .env | cut -d= -f2)
fi

# Overwrite .env with the new unified template
cp .env.template .env

# Generate new secrets if the old ones were the placeholders
[ -z "$OLD_DB_PASS" ] || [ "$OLD_DB_PASS" = "CHANGE_DB_PASSWORD" ] && OLD_DB_PASS=$(openssl rand -hex 16)
[ -z "$OLD_JWT_ACCESS" ] || [ "$OLD_JWT_ACCESS" = "CHANGE_ME_jwt_access_secret_production" ] && OLD_JWT_ACCESS=$(openssl rand -base64 48 | tr -d '\n"')
[ -z "$OLD_JWT_STAFF" ] || [ "$OLD_JWT_STAFF" = "CHANGE_ME_jwt_staff_secret_production" ] && OLD_JWT_STAFF=$(openssl rand -base64 48 | tr -d '\n"')
[ -z "$OLD_WEBHOOK" ] || [ "$OLD_WEBHOOK" = "CHANGE_ME_webhook_secret" ] && OLD_WEBHOOK=$(openssl rand -hex 24)

# Inject the secrets into the new .env
sed -i "s~CHANGE_DB_PASSWORD~$OLD_DB_PASS~g" .env
sed -i "s~CHANGE_ME_jwt_access_secret_production~$OLD_JWT_ACCESS~g" .env
sed -i "s~CHANGE_ME_jwt_staff_secret_production~$OLD_JWT_STAFF~g" .env
sed -i "s~CHANGE_ME_webhook_secret~$OLD_WEBHOOK~g" .env

echo "Unified .env created and secrets preserved."
'@

ssh -i $key -o StrictHostKeyChecking=no $server $migrateScript
Assert-Ok "write .env"

# 5. Build and start
Write-Host "`n[5/6] Building and starting Vibe (this takes a few minutes)..." -ForegroundColor Yellow
# coturn reads start.sh (a mounted file) only when the container starts, so
# recreate it explicitly; "up" alone doesn't notice a changed mounted file.
ssh -i $key -o StrictHostKeyChecking=no $server "cd /opt/vibe && docker compose up -d --build && docker compose up -d --force-recreate vibe-turn && sleep 3 && docker compose ps && docker compose logs --tail=8 vibe-turn"
Assert-Ok "build and start"

# 6. Check the TURN relay from this PC: every relay must be the PUBLIC IP.
Write-Host "`n[6/6] Checking the TURN relay..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
  $envProd = Get-Content "$vibeDir\infra\.env.prod"
  $env:TURN_URLS = (($envProd | Where-Object { $_ -match '^TURN_URLS=' }) -replace '^TURN_URLS=', '').Trim()
  $env:TURN_SECRET = (($envProd | Where-Object { $_ -match '^TURN_SECRET=' }) -replace '^TURN_SECRET=', '').Trim()
  $env:STUN_URLS = 'stun:stun.l.google.com:19302'
  node "$vibeDir\backend\scripts\turn-check.mjs"
  $turnOk = ($LASTEXITCODE -eq 0)
  Remove-Item Env:TURN_SECRET, Env:TURN_URLS, Env:STUN_URLS -ErrorAction SilentlyContinue
  if (-not $turnOk) { Write-Host "  TURN check failed: calls across networks will have no video. See above." -ForegroundColor Red; exit 1 }
} else {
  Write-Host "  node not found, skipped. Run: node backend\scripts\turn-check.mjs" -ForegroundColor DarkYellow
}

Write-Host "`n=== Vibe deployment complete! ===" -ForegroundColor Green
Write-Host "API:   https://api.vibe.fawadiqbal.dev"
Write-Host "Admin: https://vibe.fawadiqbal.dev"
