# TripTrace

A personal travel map: pin the cities you've visited, zoom in to pin the places
within them, attach notes, dates, and photos. Single-user accounts, your data is
yours only.

**Stack:** Next.js 15 (App Router, standalone output) · TypeScript · Tailwind 4 ·
Prisma 6 + PostgreSQL/PostGIS · Auth.js v5 (credentials, argon2id) · MapLibre GL ·
MinIO (S3-compatible) via presigned URLs · Docker/Podman Compose.

## Run it

```sh
cp .env.example .env          # then set NEXTAUTH_SECRET (openssl rand -base64 32)
docker compose up -d --build  # or: podman compose up -d --build
open http://localhost:3000
```

The app container applies Prisma migrations on boot (`prisma migrate deploy`),
then starts the standalone server. Postgres data and MinIO objects live on named
volumes (`pgdata`, `minio-data`) and survive restarts.

Local development without containers for the app itself:

```sh
docker compose up -d db minio minio-init
npx prisma migrate deploy
npm run dev
```

(`.env` points `DATABASE_URL`/`S3_ENDPOINT` at localhost for exactly this case;
inside compose, the app container gets `db`/`minio` hostnames injected.)

## Architecture notes

- **Geo:** Prisma can't model PostGIS types, so `Visit` carries `lat`/`lng`
  floats for the app plus a `geography(Point,4326)` column (`geom`) kept in sync
  by a database trigger, GIST-indexed.
- **Place→city attachment:** when a CITY is pinned, its administrative
  boundary polygon is fetched once from Nominatim (`NOMINATIM_URL`, throttled
  to 1 req/s with a proper User-Agent per the
  [public-instance policy](https://operations.osmfoundation.org/policies/nominatim/),
  result cached on the row as `geography(MultiPolygon)`). A place attaches to
  the **smallest stored boundary covering it** — which resolves enclaves
  correctly: a pin at St. Peter's attaches to Vatican City, not Rome, because
  Rome's polygon has a hole there. When no boundary covers the point (or the
  lookup failed — county-level results, plain place nodes, oceans, timeouts
  are all rejected), it falls back to nearest city center within 50 km, the
  original heuristic. Only CITY pin coordinates are ever sent to the
  geocoder; place pins never leave the box. New cities adopt existing places
  their boundary covers (conservatively — never stealing from a parent whose
  boundary legitimately covers the place), and the UI reports how many were
  attached. For a fully offline/at-scale variant, import
  [Overture divisions](https://docs.overturemaps.org/guides/divisions/)
  polygons into the same PostGIS and replace the fetch — the queries stay
  identical.
- **Sessions:** Auth.js Credentials can't use database sessions, so sessions are
  JWTs in an httpOnly/secure/sameSite=lax cookie (30-day expiry, rolling
  refresh). The Prisma adapter and adapter tables are wired for future OAuth.
- **Authorization:** every query filters by the session's user id; mutations
  fetch the row's owner first and answer 404 for anything not yours.
- **Photos:** browser uploads go straight to object storage with presigned PUT
  URLs (`userId/visitId/uuid.ext`). MIME type and size are validated at presign
  time and re-verified against the stored object (HeadObject) before the DB row
  is written. Two endpoints exist because presigned URLs sign the host:
  `S3_ENDPOINT` is what the server reaches (`minio:9000` in compose),
  `S3_PUBLIC_ENDPOINT` is what the browser reaches (`localhost:9000`).
- **Rate limiting:** in-memory token bucket per IP on login and signup — fine
  for a single instance; use Redis (same semantics) when scaling out.
- **Known tradeoff:** an upload that is presigned + PUT but never confirmed
  leaves an orphan object (no DB row). Harmless; add a bucket lifecycle rule
  (expire objects without a matching Photo row / older than a day) if it matters.

## Production

Everything is env-driven; no code changes to deploy:

| Swap | How |
|---|---|
| MinIO → S3/R2 | Set `S3_ENDPOINT` + `S3_PUBLIC_ENDPOINT` to the same public endpoint, plus real credentials/bucket/region |
| compose db → managed Postgres | Point `DATABASE_URL` at it (PostGIS extension required) |
| Domain | `NEXTAUTH_URL=https://your.domain` — cookies turn `secure` automatically |

Inject secrets through the platform's env mechanism — nothing is baked into the
image (`.env` is dockerignored). If the platform's disk is ephemeral, the
in-compose `db`/`minio` services are not safe to use; switch both as above.

## Deploy to a VM with an external IP

`docker-compose.prod.yml` is a self-contained production stack (publishes the
MinIO S3 port so browsers can reach photo URLs, keeps Postgres/console on
loopback, sets restart policies and MinIO CORS). Login works over plain HTTP by
IP because Auth.js derives the cookie `secure` flag from `NEXTAUTH_URL`'s scheme.

**1 — On the VM:** install Docker (or Podman) + Compose, then open ports `22`,
`3000`, `9000` in **both** the OS firewall and the cloud security group.

**2 — Get the code and configure:**
```sh
git clone https://github.com/acrighthere/TripTrace.git && cd TripTrace
cp .env.prod.example .env
# edit .env: set NEXTAUTH_SECRET (openssl rand -base64 32), strong
# POSTGRES_PASSWORD / S3_ACCESS_KEY / S3_SECRET_KEY, and put the VM's external
# IP in NEXTAUTH_URL (http://<IP>:3000) and S3_PUBLIC_ENDPOINT (http://<IP>:9000)
```

**3 — Launch** (migrations run automatically on boot):
```sh
docker compose -f docker-compose.prod.yml up -d --build
```
Open `http://<IP>:3000`. The build needs ~2 GB RAM — on a smaller VM add swap or
build the image elsewhere and push it to a registry.

> ⚠️ Over plain HTTP, passwords and session cookies travel in clear text — fine
> for a personal instance on a trusted network, not for the public internet.
> The MinIO console (`9001`) and Postgres (`5432`) stay on loopback; reach the
> console with `ssh -L 9001:localhost:9001 user@<IP>`.

### Adding a domain + HTTPS later

`docker-compose.tls.yml` + `deploy/Caddyfile` add a Caddy reverse proxy with
automatic Let's Encrypt certs. When your domain is ready:

1. Point A-records for an app host and an S3 host (e.g. `triptrace.example.com`
   and `s3.triptrace.example.com`) at the VM; open ports `80`/`443`.
2. Put those two hostnames in `deploy/Caddyfile`.
3. In `.env`, switch `NEXTAUTH_URL=https://triptrace.example.com` and
   `S3_PUBLIC_ENDPOINT=https://s3.triptrace.example.com`.
4. `docker compose -f docker-compose.tls.yml up -d --build` (it reuses the same
   data volumes; only Caddy is exposed — close `3000`/`9000` afterwards).

## Required env vars

See [.env.example](.env.example): `DATABASE_URL`, `NEXTAUTH_SECRET`,
`NEXTAUTH_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `MAP_STYLE_URL`, and the
`POSTGRES_*` trio consumed by the compose db service.
