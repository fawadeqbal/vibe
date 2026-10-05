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
robocopy "$vibeDir\web" "$tempStaging\web" /E /XD node_modules .next .git /XF .env .env.local tsconfig.tsbuildinfo /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
robocopy "$vibeDir\landing" "$tempStaging\landing" /E /XD node_modules .next out .git /XF .env .env.local /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
robocopy "$vibeDir\infra" "$tempStaging\infra" /E /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
robocopy "$vibeDir\face" "$tempStaging\face" /E /XD .venv __pycache__ .pytest_cache models /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
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
ssh -i $key -o StrictHostKeyChecking=no $server "cd /opt/vibe && sudo rm -rf backend admin web landing face docker-compose.yml ; unzip -o vibe-deploy.zip ; rm -f vibe-deploy.zip ; sudo chown -R opc:opc /opt/vibe ; chmod -R u+rwX,go+rX backend admin web landing face ; chmod +x infra/turn/*.sh ; sed -i 's/\r$//' infra/turn/*.sh infra/turn/turnserver.conf"
Assert-Ok "unpack on server"

# Migrate old secrets into the new .env and clean up the old standalone TURN server
$migrateScript = @'
cd /opt/vibe || exit 1

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

# Build the server .env from the template (infra/.env.prod, all real values).
# Keys in PINNED keep the server's current value when it has one: changing them
# on a live server would lock the API out of Postgres (the password is fixed when
# the volume is created), sign everyone out, and make payout details encrypted
# with the old key unreadable. A fresh server takes the template's values.
PINNED="VIBE_DB_PASSWORD DATABASE_URL JWT_ACCESS_SECRET JWT_STAFF_SECRET PAYMENT_WEBHOOK_SECRET DATA_ENCRYPTION_KEY"
if [ -f .env ]; then
  awk -v pinned="$PINNED" '
    BEGIN { n = split(pinned, a, " "); for (i = 1; i <= n; i++) keep[a[i]] = 1 }
    NR == FNR {
      i = index($0, "=")
      if (i > 1) { k = substr($0, 1, i - 1); if ((k in keep) && ($0 !~ /CHANGE_/)) old[k] = $0 }
      next
    }
    {
      i = index($0, "=")
      k = (i > 1) ? substr($0, 1, i - 1) : ""
      if (k in old) print old[k]; else print
    }
  ' .env .env.template > .env.new || { echo "Could not build .env from the template" >&2; exit 1; }
  mv .env.new .env
else
  cp .env.template .env
fi
chmod 600 .env

echo "Server .env written from the template (pinned secrets kept)."
'@

# Send the script base64-encoded: Windows PowerShell strips double quotes from
# arguments passed to native programs, which breaks any quoted shell code.
$migrateB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($migrateScript -replace "`r", "")))
ssh -i $key -o StrictHostKeyChecking=no $server "echo $migrateB64 | base64 -d | bash"
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
Write-Host "Landing: https://vibe.fawadiqbal.dev"
Write-Host "Web app: https://app.vibe.fawadiqbal.dev"
Write-Host "API:     https://api.vibe.fawadiqbal.dev"
Write-Host "Admin:   https://admin.vibe.fawadiqbal.dev"
Write-Host "TURN:    turn.vibe.fawadiqbal.dev"
Write-Host "(Routing for these names lives in the shared reverse proxy: infra/DOMAINS.md)"
