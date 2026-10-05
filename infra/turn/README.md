# TURN server for Vibe (video calls across different networks)

**Why:** two phones on different networks (mobile data, office Wi-Fi…) often
can't reach each other directly. A TURN server is a relay on the public
internet that both phones can always reach; it passes the video between them.
Phones still try a direct connection first and only use the relay when that
fails (typically 15–30% of calls, more on mobile data).

This folder is a ready-to-run TURN server (coturn in Docker). The Vibe API
already hands each user a short-lived TURN login, so the app needs no changes.

---

## What you need

- **A small Linux server** (Ubuntu 22.04/24.04) with a **public IP**:
  1–2 vCPU and 1–2 GB RAM is plenty to start. What matters is **bandwidth**,
  so pick a provider that includes several TB of traffic per month.
  Choose a location close to most of your users.
- **A domain name for it**, e.g. `turn.yourapp.com`.

## Setup (about 15 minutes)

**1. Point the domain at the server.** In your DNS, add an `A` record:
`turn.yourapp.com → <server's public IP>`.

**2. Install Docker on the server.**

```sh
curl -fsSL https://get.docker.com | sh
```

**3. Copy this `turn` folder to the server** (e.g. to `/opt/vibe-turn`):

```sh
scp -r backend/turn root@<server-ip>:/opt/vibe-turn
```

**4. Fill in the settings.** On the server:

```sh
cd /opt/vibe-turn
cp .env.example .env
openssl rand -hex 32          # copy this: it's your TURN_SECRET
nano .env
```

| Setting | What to put |
|---|---|
| `TURN_DOMAIN` | `turn.yourapp.com` |
| `TURN_SECRET` | the long random string from `openssl rand -hex 32` |
| `TURN_TLS_PORT` | `5349`, or `443` if this server runs nothing else (gets through strict office/hotel Wi-Fi) |
| `TURN_EXTERNAL_IP` | empty on most VPS; `<public ip>/<private ip>` (or `auto`) on AWS, Google Cloud, Azure, Oracle |
| `CERT_EMAIL` | your e-mail (certificate expiry warnings) |

**5. Open the firewall ports.** On the server (if it uses `ufw`):

```sh
ufw allow 80/tcp                 # only for getting the certificate
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp               # or 443/tcp if you chose 443
ufw allow 49152:65535/udp        # the relayed audio/video
```

Also open the same ports in your cloud provider's firewall / security group
if it has one (AWS, Google Cloud, Hetzner Cloud Firewall, etc.).

**6. Get the certificate** (free, Let's Encrypt, renews by itself):

```sh
sudo sh install-cert.sh
```

**7. Start it.**

```sh
docker compose up -d
docker compose logs -f           # should end with "turn: starting coturn for turn.yourapp.com"
```

**8. Tell the API about it.** In the API's `backend/.env` (on your API server):

```
TURN_URLS=turn:turn.yourapp.com:3478?transport=udp,turn:turn.yourapp.com:3478?transport=tcp,turns:turn.yourapp.com:5349?transport=tcp
TURN_SECRET=<exactly the same secret as in turn/.env>
TURN_TTL_SECONDS=86400
```

(Use `:443` in the `turns:` address if you chose 443.) Restart the API. Its
log now says `TURN relay on: …`.

**9. Check it.** From the `backend` folder, on any computer with the API's
`.env`:

```sh
npm run turn:check
```

You should see a ✓ for each address and "All good". If not, see
*Troubleshooting* below.

**10. Test with real phones.** Build the app once with the relay forced on,
so every call has to go through TURN, even on the same Wi-Fi:

```sh
flutter build apk --release --dart-define=VIBE_API=https://api.vibe.fawadiqbal.dev --dart-define=VIBE_FORCE_RELAY=true
```

If two phones can call each other, the relay works. Then build normally
(without `VIBE_FORCE_RELAY`) for the store.

---

## Troubleshooting (`npm run turn:check` messages)

| Message | Fix |
|---|---|
| `domain not found (DNS)` | The `A` record isn't set yet, or hasn't spread (wait up to an hour). |
| `no answer on UDP/TCP port …` | Firewall: open that port on the server **and** in the cloud provider's firewall. Is the container running (`docker compose ps`)? |
| `connection refused` | Nothing listening: check `docker compose logs` for errors. |
| `password rejected` | `TURN_SECRET` differs between the API's `.env` and `turn/.env` (or the server clock is wrong: `timedatectl`). |
| ✓ for `turn:` but ✗ for `turns:` | No certificate: run `sudo sh install-cert.sh`, then `docker compose restart`. |
| `relay 10.x… is a PRIVATE address` | Cloud VM without `TURN_EXTERNAL_IP`: set `<public ip>/<private ip>` in `.env`, then `docker compose up -d --force-recreate` (`restart` does not re-read `.env`). |
| All ✓, but calls still fail | Open the relay range `49152-65535/udp`. On AWS/GCP/Azure/Oracle set `TURN_EXTERNAL_IP=auto`. |

## Costs

Relayed calls pass through this server. A relayed video call uses about
**1.5 GB of server traffic per hour**. Example: 1,000 hours of calls a month,
of which 20% need the relay → about 300 GB/month. Many VPS plans include
several TB; big clouds (AWS, Google Cloud) bill every GB, which adds up.
Watch the traffic graph in your provider's dashboard as you grow; add a
second TURN server (another `turn:` address in `TURN_URLS`) when one is busy.

## Security, built in

- No passwords are stored: each user gets a login from the API that expires
  after 24 hours (`TURN_TTL_SECONDS`), made with the shared secret.
- The relay can only reach public internet addresses, never private networks.
- Per-user limit of 12 relays and about 4 Mbit/s per relay, against abuse.
- Keep `TURN_SECRET` private. To change it: put the new value in both `.env`
  files, then restart the API and `docker compose restart` here.

## Files

| File | What it is |
|---|---|
| `docker-compose.yml` | Runs coturn 4.18 (host networking, auto-restart). |
| `turnserver.conf` | coturn settings (auth, limits, security). |
| `start.sh` | Adds the values from `.env` and starts coturn. |
| `install-cert.sh` | Gets and renews the TLS certificate. |
| `.env.example` | The settings to fill in. |
| `../scripts/turn-check.mjs` | `npm run turn:check`: tests the server with the API's settings. |
