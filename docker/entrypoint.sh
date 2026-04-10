#!/bin/sh
set -eu

if [ "${SKIP_DB_MIGRATIONS:-false}" != "true" ]; then
  echo "Applying Prisma migrations..."
  npx prisma migrate deploy
fi

echo "Starting Photo Studio application..."
exec node server.js
