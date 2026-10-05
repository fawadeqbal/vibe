#!/bin/sh
# Starts coturn with turnserver.conf plus the values from turn/.env.
# Runs inside the container (see docker-compose.yml). The secret goes into a
# private config file, not the command line, so `ps` on the host can't see it.
set -eu

fail() { echo "turn: $*" >&2; exit 1; }

[ -n "${TURN_SECRET:-}" ] || fail "TURN_SECRET is empty. Set it in turn/.env (same value as TURN_SECRET in the API's .env)."
[ "${#TURN_SECRET}" -ge 32 ] || fail "TURN_SECRET is too short. Use at least 32 characters, e.g. the output of: openssl rand -hex 32"
[ -n "${TURN_DOMAIN:-}" ] || fail "TURN_DOMAIN is empty. Set it in turn/.env (e.g. turn.yourapp.com)."

conf=/tmp/turnserver.conf
umask 077
cat /etc/coturn/turnserver.conf > "$conf"
{
  echo "realm=$TURN_DOMAIN"
  echo "server-name=$TURN_DOMAIN"
  echo "static-auth-secret=$TURN_SECRET"
  echo "tls-listening-port=${TURN_TLS_PORT:-5349}"
  echo "min-port=${TURN_MIN_PORT:-49152}"
  echo "max-port=${TURN_MAX_PORT:-65535}"
} >> "$conf"

# Public address: needed on clouds where the machine only sees a private IP
# (AWS, Google Cloud, Azure, Oracle...). "auto" asks the internet.
case "${TURN_EXTERNAL_IP:-}" in
  "") ;;
  auto)
    ip="$(detect-external-ip 2>/dev/null | head -n 1 | tr -d ' \r')" || ip=""
    # An empty answer would leave external-ip unset: coturn then hands phones its private
    # address (e.g. 10.0.0.x) as the relay and every relayed call fails without an error.
    echo "$ip" | grep -Eq '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' || fail "could not detect the public IP (got '$ip'); set TURN_EXTERNAL_IP=<public ip>/<private ip> in turn/.env"
    echo "turn: public IP detected: $ip"
    echo "external-ip=$ip" >> "$conf" ;;
  *) echo "external-ip=$TURN_EXTERNAL_IP" >> "$conf" ;;
esac

# Testing only: let the relay reach these private addresses.
for ip in $(echo "${TURN_ALLOW_PEER_IPS:-}" | tr ',' ' '); do
  echo "allowed-peer-ip=$ip" >> "$conf"
done

if [ -r /etc/coturn/certs/fullchain.pem ] && [ -r /etc/coturn/certs/privkey.pem ]; then
  echo "cert=/etc/coturn/certs/fullchain.pem" >> "$conf"
  echo "pkey=/etc/coturn/certs/privkey.pem" >> "$conf"
  echo "turn: TLS on port ${TURN_TLS_PORT:-5349}"
else
  echo "turn: WARNING no certificate in turn/certs, so turns: (TLS) is OFF. Run: sudo sh install-cert.sh" >&2
  echo "no-tls" >> "$conf"
fi

echo "turn: starting coturn for $TURN_DOMAIN (relay ports ${TURN_MIN_PORT:-49152}-${TURN_MAX_PORT:-65535})"
exec turnserver -c "$conf"
