$ErrorActionPreference = "Stop"
$key = "$PSScriptRoot\..\..\..\..\Kids Coding Platform\repo\scripts\ssh-key-2026-10-02.key"
$server = "opc@145.241.156.60"
$vibeDir = "$PSScriptRoot\.."
$zipFile = "$vibeDir\vibe-deploy.zip"

Write-Host "=== Deploying Vibe to production ===" -ForegroundColor Cyan

# 1. Create directory on server
Write-Host "`n[1/5] Creating /opt/vibe on server..." -ForegroundColor Yellow
ssh -i $key -o StrictHostKeyChecking=no $server "sudo mkdir -p /opt/vibe && sudo chown -R opc:opc /opt/vibe"

# 2. Zip and upload as one file
Write-Host "`n[2/5] Zipping project (excluding node_modules, .git, dist)..." -ForegroundColor Yellow
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

Write-Host "`n[3/5] Uploading zip to server..." -ForegroundColor Yellow
scp -i $key -o StrictHostKeyChecking=no $zipFile "${server}:/opt/vibe/vibe-deploy.zip"
Remove-Item $zipFile -Force

# 4. Unzip, fix permissions, generate secrets
Write-Host "`n[4/5] Unpacking and generating production secrets..." -ForegroundColor Yellow
# Use sudo for rm because previous Docker builds may have left root-owned files
ssh -i $key -o StrictHostKeyChecking=no $server "cd /opt/vibe && sudo rm -rf backend admin docker-compose.yml ; unzip -o vibe-deploy.zip ; rm -f vibe-deploy.zip ; sudo chown -R opc:opc /opt/vibe ; chmod -R u+rwX,go+rX backend admin"

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

# 5. Build and start
Write-Host "`n[5/5] Building and starting Vibe (this takes a few minutes)..." -ForegroundColor Yellow
ssh -i $key -o StrictHostKeyChecking=no $server "cd /opt/vibe && docker compose up -d --build"

Write-Host "`n=== Vibe deployment complete! ===" -ForegroundColor Green
Write-Host "API:   https://api.vibe.fawadiqbal.dev"
Write-Host "Admin: https://vibe.fawadiqbal.dev"
