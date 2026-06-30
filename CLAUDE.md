# TripTrace — project guide for Claude

A self-hosted personal travel map: pin the **cities** and **places** you've
visited (or want to visit), attach notes, dates, and photos, group them into
**trips** with route lines, and see **travel stats**. Single-user accounts; all
data is strictly scoped per user.

This file is the durable project reference — read it first each session. For
session-to-session "what's in flight" state, see the auto-memory index.

## Stack (pinned deliberately — do not bump majors casually)

- **Next.js 15.5** App Router, `output: "standalone"` · React 19 · TypeScript · **Tailwind 4** (CSS-first, no config file)
- **Prisma 6** + **PostgreSQL/PostGIS** (postgis/postgis:16-3.4). Prisma 7 and Next 16 are intentionally avoided.
- **Auth.js v5** (next-auth 5 beta) — Credentials provider, **argon2id**, **JWT sessions** (Credentials can't use DB sessions)
- **MinIO** (S3-compatible) via `@aws-sdk/client-s3` presigned URLs
- **MapLibre GL 5** client map (free OpenFreeMap vector style)
- **Nominatim** for city admin boundaries + reverse geocoding (env-switchable)
- Containerized with compose; runtime here is **podman** (see Gotchas)

## Run it

Local dev (app on host, backends in containers):
```sh
podman compose up -d db minio minio-init   # NOTE: containers are named triptrace_db_1 etc (underscores)
npx prisma migrate deploy
npm run dev                                  # http://localhost:3000
```
Full stack in containers: `podman compose up -d --build`.
The app entrypoint runs `prisma migrate deploy` on boot.

Test accounts (dev DB): `vatican-test@example.com` / `test-password-1` (rich
demo data: Rome/Vatican/Tokyo/Kyoto + a wishlist pin). The **real owner** uses
`rodionovmaksprog@mail.ru` — treat that account's data as production; only do
read-only/cancellable actions on it.

## Architecture & key decisions

- **JWT sessions** (not DB) — Auth.js Credentials limitation. Cookie
  httpOnly/sameSite=lax, `secure` derived from `NEXTAUTH_URL` scheme (so
  http://IP login works without TLS). Adapter tables kept for future OAuth.
- **Edge-safe auth split:** `lib/auth.config.ts` (no Prisma/argon2) for
  `middleware.ts`; `lib/auth.ts` adds adapter + Credentials. Middleware is
  defense-in-depth only — **every route handler independently calls
  `requireUserId()` and scopes queries by `userId`.** 404 (not 403) for
  other users' rows so existence isn't revealed.
- **Geo:** Prisma can't model PostGIS, so `Visit` has `lat`/`lng` floats +
  a trigger-synced `geom geography(Point)` (GIST-indexed) + a `boundary
  geography(MultiPolygon)` on cities. Both declared `Unsupported(...)` in
  schema so `migrate dev` won't drop them.
- **Place→city attachment** ([lib/geo.ts](lib/geo.ts) `findParentCityId`):
  smallest **boundary that ST_Covers the point** wins (resolves enclaves —
  Vatican vs Rome), falling back to nearest city center within 50 km. City
  boundaries are fetched once from Nominatim on create and cached on the row.
- **Country/continent:** the same city reverse-lookup ([lib/boundaries.ts](lib/boundaries.ts)
  `lookupCity`, `addressdetails=1`, `Accept-Language: en`) captures
  country/countryCode; continent derived via [lib/continents.ts](lib/continents.ts).
  Places **inherit** country from their parent city (no extra lookup). Backfill
  for pre-existing rows: `POST /api/stats/backfill`.
- **Photos:** browser uploads go straight to MinIO via presigned PUT
  (`userId/visitId/uuid.ext`); MIME/size validated at presign AND re-checked
  via HeadObject before the DB row. **Two S3 endpoints** because presigned URLs
  sign the host: `S3_ENDPOINT` (server → `minio:9000`), `S3_PUBLIC_ENDPOINT`
  (browser-reachable). Same URL for real S3/R2.
- **Nominatim politeness:** in-process 1 req/s queue + User-Agent in
  [lib/boundaries.ts](lib/boundaries.ts). Only CITY coords are ever sent.
- **Rate limiting:** in-memory token bucket per IP ([lib/rate-limit.ts](lib/rate-limit.ts)) on login/signup/visit-create/backfill. Use Redis for multi-instance.

## Data model (prisma/schema.prisma)

- `User` — id, email (unique, lowercased), passwordHash, … ; relations: visits, trips, accounts/sessions (adapter)
- `Visit` — type `CITY|PLACE`, status `VISITED|WISHLIST` (default VISITED),
  name, lat/lng, **parentId** (self-FK, app-level cascade on delete),
  **tripId** (FK, ON DELETE SET NULL), notes, **visitedAt/visitedTo** (range),
  country/countryCode/continent, geom, boundary, photos[]. Indexes on userId,
  parentId, tripId, (userId,countryCode).
- `Trip` — userId, name, color (round-robin from `TRIP_COLORS`), createdAt, visits[]
- `Photo` — visitId (FK Cascade), storageKey, caption
- Deleting a CITY cascades to its child places + all their photos + MinIO
  objects in app code ([app/api/visits/[id]/route.ts](app/api/visits/[id]/route.ts)).
  Deleting a TRIP only detaches visits (never deletes them).

## Routes (all under `requireUserId`, matched in middleware.ts)

`/api/visits` GET·POST · `/api/visits/[id]` PATCH·DELETE ·
`/api/photos` GET·POST · `/api/photos/presign` POST · `/api/photos/[id]` DELETE ·
`/api/stats` GET · `/api/stats/backfill` POST ·
`/api/trips` GET·POST · `/api/trips/[id]` PATCH·DELETE ·
`/api/signup` POST · `/api/health` GET · `/api/auth/[...nextauth]`.

Client: [components/MapApp.tsx](components/MapApp.tsx) (state hub, optimistic
updates) → [MapView.tsx](components/MapView.tsx) (MapLibre: clustered cities,
zoom-gated places, wishlist=hollow pins, trip route lines, label hit-testing
for pin-by-label) + [SidePanel.tsx](components/SidePanel.tsx) (tree/search,
trip section, visit detail) with [VisitForm.tsx](components/VisitForm.tsx),
[PhotoSection.tsx](components/PhotoSection.tsx), [StatsPanel.tsx](components/StatsPanel.tsx),
[TripDetail.tsx](components/TripDetail.tsx), [Toast.tsx](components/Toast.tsx).

## Features shipped

Phases 0–7 (auth, map, pinning CRUD, photos, side panel, hardening) · pin a
city by clicking its **basemap label** · **boundary-based** place→city
attribution · **country/continent** persistence · **travel stats dashboard**
(countries, % of world, continents, widest-span pair, per-country list with
flags) · **date ranges** per visit · **wishlist** pins · **trips** (route
lines + distance + assignment).

## Deployment

- `docker-compose.yml` — dev. `docker-compose.prod.yml` — VM by external IP
  over HTTP (publishes MinIO :9000, loopback db/console, restart policies,
  MinIO CORS). `docker-compose.tls.yml` + `deploy/Caddyfile` — domain + auto
  HTTPS via Caddy. `.env.prod.example` is the server env template.
- Everything env-driven: swap MinIO→S3/R2 and compose-db→managed Postgres
  without code changes. The critical server vars are `NEXTAUTH_URL` and
  `S3_PUBLIC_ENDPOINT` (must use the public host, not localhost). See README
  "Deploy to a VM".

## Verification approach

- Type-check: `npm run build` — **but never while `next dev` is running** (it
  clobbers the shared `.next` and 500s the dev server; if it happens, stop dev,
  `rm -rf .next`, restart).
- API smoke tests: curl with a cookie jar (csrf → credentials callback →
  scoped requests). Always include cross-user 404 checks for new routes.
- Browser: the preview tools (`preview_start` runs `npm run dev`).
- DB checks: `podman exec triptrace_db_1 psql -U triptrace -d triptrace -c '…'`.

## Gotchas

- **podman, not docker** on this machine. `podman compose` works; container
  names use underscores (`triptrace_db_1`). VM is 2 GiB — the **db container
  drops under memory pressure**; restart with `podman compose up -d db minio minio-init`.
- Host **port 3000** is held by podman's gvproxy when the app container runs;
  host-side dev servers then need another port (preview tool auto-ports).
- Never run `npm run build` against a live `next dev` (see above).
- The image build needs ~2 GiB RAM; on a small VM add swap or prebuild + push.
- After changing `schema.prisma`, run `npx prisma generate` AND restart any
  running dev server (cached Prisma client won't have new models/fields).

## Current state (update as it changes)

- Original phased plan: `~/.claude/plans/encapsulated-percolating-lovelace.md`.
- **Large uncommitted change set** in the working tree: country+stats,
  date-ranges, wishlist, trips, and the prod/TLS deploy files. Nothing from
  this work is committed yet (last commit `add5710` = boundary attribution).
- Roadmap/backlog (≈22 items) lives in the auto-memory `triptrace-backlog`
  entry. Next highest-leverage picks: country **choropleth fill** (boundary
  data already stored) or **password reset** (no recovery flow exists today —
  a real gap).
