#!/bin/sh
set -e

echo "[entrypoint] applying database migrations..."
prisma migrate deploy --schema /app/prisma/schema.prisma

echo "[entrypoint] starting server..."
exec node /app/server.js
