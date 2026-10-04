#!/bin/sh
# Gets a free Let's Encrypt certificate for TURN_DOMAIN and puts it where
# coturn reads it (turn/certs). Renewal is automatic: certbot re-runs this
# script with --copy after each renewal, which also restarts coturn.
#
# Run on the TURN server as root, from this folder:   sudo sh install-cert.sh
# Needs: TURN_DOMAIN pointing at this server, and port 80 open and free.
set -eu

dir="$(cd "$(dirname "$0")" && pwd)"
[ -f "$dir/.env" ] || { echo "Missing $dir/.env (copy .env.example to .env first)" >&2; exit 1; }
# shellcheck disable=SC1091
. "$dir/.env"
: "${TURN_DOMAIN:?set TURN_DOMAIN in .env}"

copy() {
  live="/etc/letsencrypt/live/$TURN_DOMAIN"
  mkdir -p "$dir/certs"
  cp -L "$live/fullchain.pem" "$dir/certs/fullchain.pem"
  cp -L "$live/privkey.pem" "$dir/certs/privkey.pem"
  # coturn runs as user "nobody" (uid 65534) inside the container.
  chown 65534 "$dir/certs/fullchain.pem" "$dir/certs/privkey.pem"
  chmod 644 "$dir/certs/fullchain.pem"
  chmod 600 "$dir/certs/privkey.pem"
  echo "Certificate for $TURN_DOMAIN copied to $dir/certs"
  if docker compose -f "$dir/docker-compose.yml" ps --status running --quiet 2>/dev/null | grep -q .; then
    docker compose -f "$dir/docker-compose.yml" restart coturn
    echo "coturn restarted with the new certificate"
  fi
}

if [ "${1:-}" = "--copy" ]; then
  copy
  exit 0
fi

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo sh $0" >&2; exit 1; }

if ! command -v certbot >/dev/null 2>&1; then
  echo "Installing certbot..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -q && apt-get install -y -q certbot
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y epel-release && dnf install -y certbot
  elif command -v yum >/dev/null 2>&1; then
    yum install -y epel-release && yum install -y certbot
  else
    echo "Could not find apt-get, dnf, or yum. Please install certbot manually." >&2
    exit 1
  fi
fi

certbot certonly --standalone --preferred-challenges http \
  -d "$TURN_DOMAIN" --non-interactive --agree-tos -m "${CERT_EMAIL:?set CERT_EMAIL in .env}" \
  --deploy-hook "sh $dir/install-cert.sh --copy"

copy
