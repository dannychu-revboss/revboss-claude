#!/bin/sh
set -e

# Create/update the SQLite schema on the mounted volume, then start Next.js.
./node_modules/.bin/prisma db push --skip-generate --schema ./prisma/schema.prisma

exec node server.js
