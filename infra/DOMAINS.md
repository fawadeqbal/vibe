# Vibe domains

| Address | What | Container : port |
|---|---|---|
| `vibe.fawadiqbal.dev` | Landing page | `vibe-landing:3003` |
| `app.vibe.fawadiqbal.dev` | Web app | `vibe-web:3002` |
| `api.vibe.fawadiqbal.dev` | API, sockets, `/media` photos | `vibe-api:3000` |
| `admin.vibe.fawadiqbal.dev` | Admin panel | `vibe-admin:3001` |
| `turn.vibe.fawadiqbal.dev` | TURN relay (calls) | `vibe-turn`, host network: 3478 udp/tcp, 5349 tcp, relay ports |

Optional later: `media.vibe.fawadiqbal.dev` (a CDN in front of `api…/media`, set `S3_PUBLIC_URL`), `status.vibe.fawadiqbal.dev`.

## Where each name is set

- `infra/.env.prod`: `PUBLIC_URL` (API), `SITE_URL`, `WEB_APP_URL`, `ADMIN_URL`, `CORS_ORIGINS`, `TURN_DOMAIN` / `TURN_URLS`.
- `infra/docker-compose.prod.yml`: passes them to the web and landing builds (`NEXT_PUBLIC_*` are baked in at build time).
- `app/.env`: `VIBE_API`, `VIBE_SITE_URL` (invite links).
- `web/.env.local`, `landing/.env.example`: the same values for local runs.
- Invite links are `https://vibe.fawadiqbal.dev/i/<code>`; the landing page's nginx sends them to `/?invite=<code>`.

## 1. DNS (A records → 145.241.156.60)

`vibe`, `app.vibe`, `api.vibe`, `admin.vibe`, `turn.vibe` (`turn.vibe` must be DNS only, not proxied by Cloudflare).

## 2. Reverse proxy (the shared `global-proxy` container on the server)

The proxy config is not in this repo. Add one site per name, all over HTTPS, proxying to the containers above by name on the `global-proxy` network. The API and the web app need WebSocket upgrade (Socket.IO). Change the old `vibe.fawadiqbal.dev → vibe-admin:3001` entry to `vibe-landing:3003`.

nginx:

```nginx
server { listen 443 ssl; server_name vibe.fawadiqbal.dev;       location / { proxy_pass http://vibe-landing:3003; proxy_set_header Host $host; } }
server { listen 443 ssl; server_name app.vibe.fawadiqbal.dev;   location / { proxy_pass http://vibe-web:3002;     proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; } }
server { listen 443 ssl; server_name admin.vibe.fawadiqbal.dev; location / { proxy_pass http://vibe-admin:3001;   proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; } }
server { listen 443 ssl; server_name api.vibe.fawadiqbal.dev;
  client_max_body_size 20m;
  location / {
    proxy_pass http://vibe-api:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";
    proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 120s;
  }
}
# + ssl_certificate lines for each name, and a port-80 → https redirect.
```

Caddy (certificates and WebSockets are automatic):

```
vibe.fawadiqbal.dev        { reverse_proxy vibe-landing:3003 }
app.vibe.fawadiqbal.dev    { reverse_proxy vibe-web:3002 }
api.vibe.fawadiqbal.dev    { reverse_proxy vibe-api:3000 }
admin.vibe.fawadiqbal.dev  { reverse_proxy vibe-admin:3001 }
```

## 3. Outside dashboards (when those keys are added)

- Google OAuth web client: authorised JavaScript origin `https://app.vibe.fawadiqbal.dev`.
- Apple Sign in (Android web flow): return URL `https://api.vibe.fawadiqbal.dev/v1/auth/apple/callback`.
- Payment providers' webhook / return URLs stay on `https://api.vibe.fawadiqbal.dev` (see backend/INTEGRATIONS.md).
