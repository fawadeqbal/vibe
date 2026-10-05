#!/usr/bin/env bash
# Vibe production deploy — runs ON THE SERVER (145.241.156.60, user opc).
#
#   GitHub Actions runs it on every push to main (.github/workflows/deploy.yml).
#   By hand on the server:   bash /opt/vibe/infra/deploy.sh            # latest main
#                            bash /opt/vibe/infra/deploy.sh <commit>   # a given commit (rollback)
#
# What it does: pull the repo into /opt/vibe with the server's read-only deploy
# key, rebuild the server .env from infra/.env.prod (pinned secrets kept), then
# `docker compose up -d --build` and wait for the API to be healthy.
# One-time setup (keys + secrets): infra/CICD.md
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vibe}"
BRANCH="${DEPLOY_BRANCH:-main}"
REPO_URL="${REPO_URL:-git@github-vibe:fawadeqbal/vibe.git}"   # "github-vibe" = alias in ~/.ssh/config
TARGET="${1:-}"                                                 # commit to deploy (default: tip of $BRANCH)

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31mDEPLOY FAILED: %s\033[0m\n' "$*" >&2; exit 1; }

main() {
  exec </dev/null   # nothing below may read stdin

  # One deploy at a time (two quick pushes, or Actions + a manual run).
  exec 9>/tmp/vibe-deploy.lock
  flock -w 900 9 || fail "another deploy is still running"

  command -v git    >/dev/null || fail "git is not installed (sudo dnf install -y git)"
  command -v docker >/dev/null || fail "docker is not installed"

  sudo mkdir -p "$APP_DIR"
  sudo chown "$(id -u):$(id -g)" "$APP_DIR"
  cd "$APP_DIR"

  # ── 1. Code ───────────────────────────────────────────────────────────────
  log "[1/5] Fetching code"
  if [ ! -d .git ]; then
    # First run: turn the existing /opt/vibe (from deploy.ps1) into a checkout.
    # Untracked files — .env, infra/turn/certs, docker volumes — are left alone.
    git init -q
    git remote add origin "$REPO_URL"
  fi
  # Old zip deploys / builds may have left root-owned files git can't overwrite.
  # (Not infra/: infra/turn/certs must stay owned by coturn's user.)
  sudo chown -R "$(id -u):$(id -g)" backend admin web landing face 2>/dev/null || true
  git remote set-url origin "$REPO_URL"
  git config core.fileMode false          # we chmod files below; don't treat that as a change
  git fetch --quiet --prune origin "$BRANCH" || fail "git fetch failed — check the deploy key (ssh -T git@github-vibe)"

  PREV="$(git rev-parse --short HEAD 2>/dev/null || echo none)"
  [ -n "$TARGET" ] || TARGET="origin/$BRANCH"
  git reset --quiet --hard "$TARGET" || fail "commit '$TARGET' not found on origin/$BRANCH"
  NOW="$(git rev-parse --short HEAD)"
  echo "  $PREV -> $NOW  $(git log -1 --format='%s (%an)')"

  # Nothing for the server in this push (only the Flutter app, docs, notes)?
  # Leave the containers alone. FORCE=1 (manual "Run workflow") always rebuilds.
  if [ -z "${FORCE:-}" ] && git cat-file -e "${PREV}^{commit}" 2>/dev/null; then
    if ! git diff --name-only "$PREV" "$NOW" | grep -qvE '^(app/|docs/|\.github/|notes\.txt$)|\.md$'; then
      printf '\n\033[1;32mNothing server-side changed since %s — containers left running as they are.\033[0m\n' "$PREV"
      return 0
    fi
  fi

  chmod -R u+rwX,go+rX backend admin web landing face
  chmod +x infra/turn/*.sh

  # Same layout deploy.ps1 used: compose file + env template at the root.
  cp infra/docker-compose.prod.yml docker-compose.yml
  cp infra/.env.prod .env.template

  grep -qE '^TURN_EXTERNAL_IP=\S' .env.template \
    || fail "infra/.env.prod has no TURN_EXTERNAL_IP (e.g. 145.241.156.60/10.0.0.44)"

  # ── 2. Server .env ────────────────────────────────────────────────────────
  log "[2/5] Writing .env (pinned secrets kept)"
  # PINNED keys keep the server's current value: changing them on a live server
  # locks the API out of Postgres, signs everyone out, and makes encrypted payout
  # details unreadable. A fresh server takes the template's values.
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
    ' .env .env.template > .env.new || fail "could not build .env from the template"
    mv .env.new .env
  else
    cp .env.template .env
  fi
  chmod 600 .env

  # Old standalone TURN server (pre-compose setup) must not hold the ports.
  if [ -f /opt/vibe-turn/docker-compose.yml ]; then
    (cd /opt/vibe-turn && docker compose down >/dev/null 2>&1) || true
  fi

  # ── 3. Build + start ──────────────────────────────────────────────────────
  log "[3/5] Building and starting containers (a few minutes)"
  docker compose up -d --build
  # coturn reads start.sh only at container start; "up" doesn't see a changed mount.
  docker compose up -d --force-recreate vibe-turn

  # ── 4. Health ─────────────────────────────────────────────────────────────
  log "[4/5] Waiting for the API to be healthy"
  for _ in $(seq 1 40); do                      # up to ~200 s
    state="$(docker inspect -f '{{.State.Health.Status}}' vibe-api 2>/dev/null || echo missing)"
    [ "$state" = healthy ] && break
    sleep 5
  done
  docker compose ps
  if [ "$state" != healthy ]; then
    docker compose logs --tail=60 vibe-api || true
    fail "vibe-api is '$state'. Roll back with: bash $APP_DIR/infra/deploy.sh $PREV"
  fi
  bad="$(docker compose ps --format '{{.Name}} {{.State}}' | awk '$2 != "running" && $1 != "vibe-storage-init"')"
  [ -z "$bad" ] || fail "not running: $bad"

  # ── 5. Clean up ───────────────────────────────────────────────────────────
  log "[5/5] Removing dangling images"
  docker image prune -f >/dev/null || true

  printf '\n\033[1;32mDeployed %s (%s)\033[0m  previous: %s\n' "$NOW" "$BRANCH" "$PREV"
}

main "$@"
