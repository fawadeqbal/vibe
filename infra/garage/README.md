# vibe-storage — self-hosted S3 (Garage)

Profile photos and selfies live in [Garage](https://garagehq.deuxfleurs.fr), an S3-compatible object store, running as the `vibe-storage` container next to Postgres and Redis. It sits on the private `vibe-internal` network only; nothing is published to the internet.

```
phone / web ──https──▶ api.vibe.fawadiqbal.dev/media/avatars/…   (vibe-api streams it)
                                    │  S3, http://vibe-storage:3900
                                    ▼
                              vibe-storage (Garage)  ── volumes storage-data, storage-meta
```

| Bucket | Holds | Reachable from outside |
| --- | --- | --- |
| `vibe-media` | profile photos | yes, through the API at `/media/<key>` (cached 1 year; each upload gets a new key) |
| `vibe-private` | selfies waiting for staff review | never — read by the API only |

## How it starts

`docker compose up` starts `vibe-storage`, then the one-shot `vibe-storage-init` (`init.mjs`, plain Node) talks to Garage's admin API and makes sure the node has a layout, both buckets exist and the API's access key is imported with read/write on them. It only does what is missing, so every redeploy is a no-op. `vibe-api` waits for it to finish.

## Settings (`infra/.env.prod`)

| Key | Value |
| --- | --- |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | `http://vibe-storage:3900` |
| `S3_REGION` | `garage` |
| `S3_FORCE_PATH_STYLE` | `true` |
| `S3_BUCKET` / `S3_PRIVATE_BUCKET` | `vibe-media` / `vibe-private` |
| `S3_PUBLIC_URL` | empty — the API serves `<PUBLIC_URL>/media`. Put a CDN in front later by setting this to its URL, with the API as origin. |
| `GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Real values in `.env.prod`, deployed as-is. `S3_ACCESS_KEY_ID` must be `GK` + 24 hex chars, the others 64 hex (`openssl rand -hex 32`). To rotate the access key, put a new id + secret in `.env.prod` and redeploy: the init step imports it. |

Photos stored on disk before the switch (the old `uploads` volume) are still served at the same URLs: `/media` checks the bucket first, then the disk.

## Day to day (on the server, in `/opt/vibe`)

```bash
docker compose logs vibe-storage-init          # what the bootstrap did
docker exec vibe-storage /garage status        # node health
docker exec vibe-storage /garage bucket info vibe-media   # object count, size
```

**Backups:** the data is in the `vibe_storage-data` and `vibe_storage-meta` Docker volumes (Garage also snapshots its metadata every 6 h inside `storage-meta`). Back both up together, e.g. `docker run --rm -v vibe_storage-data:/d -v vibe_storage-meta:/m -v $PWD:/out alpine tar czf /out/vibe-storage.tgz /d /m` while `vibe-storage` is stopped.

**Local development** keeps `STORAGE_DRIVER=local` (files in `backend/uploads`). To try Garage locally, run the same image with this `garage.toml` and `node init.mjs` against `http://localhost:3903`.
