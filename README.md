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
  by a database trigger, GIST-indexed. Place→city attachment uses
  `ST_DWithin` (50 km) + nearest-neighbor ordering, always scoped to the owner.
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

## Required env vars

See [.env.example](.env.example): `DATABASE_URL`, `NEXTAUTH_SECRET`,
`NEXTAUTH_URL`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `MAP_STYLE_URL`, and the
`POSTGRES_*` trio consumed by the compose db service.
