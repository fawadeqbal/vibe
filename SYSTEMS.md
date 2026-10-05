# Vibe systems

| System | URL | What it is |
|---|---|---|
| Landing page | https://vibe.fawadiqbal.dev | Public marketing site; also handles invite links (`/i/<code>`). |
| Web app | https://app.vibe.fawadiqbal.dev | The Vibe app in the browser for users. |
| API | https://api.vibe.fawadiqbal.dev | Backend REST API, Socket.IO and `/media` photos. |
| Admin panel | https://admin.vibe.fawadiqbal.dev | Staff dashboard for moderation and management. |
| TURN relay | `turn:turn.vibe.fawadiqbal.dev:3478` | Relays audio/video calls when a direct connection fails. |
| Mobile app | Android / iOS build from `app/` | Flutter app; talks to the API above. |

Internal only (server network, no public URL): `vibe-face` (selfie verification), `vibe-postgres`, `vibe-redis`, `vibe-storage` (S3 storage).

All services run as Docker containers on `145.241.156.60`. More detail: `infra/DOMAINS.md`.
