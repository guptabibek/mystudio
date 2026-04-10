#!/bin/sh
set -eu

if [ "${SKIP_DB_MIGRATIONS:-false}" != "true" ]; then
  echo "Preparing production database..."
  node scripts/prepare-production-db.mjs
fi

echo "Starting Photo Studio application..."
exec node server.js
