#!/bin/bash
set -e

echo "🔁 Starting custom initialization..."

# Run the main init.sql if it exists
if [ -f /docker-entrypoint-initdb.d/init.sql ]; then
  echo "➡️ Running init.sql..."
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /docker-entrypoint-initdb.d/init.sql
fi

# Run all SQL files inside the migrations folder
if [ -d /docker-entrypoint-initdb.d/migrations ]; then
  for f in /docker-entrypoint-initdb.d/migrations/*.sql; do
    if [ -f "$f" ]; then
      echo "➡️ Running migration: $(basename "$f")"
      psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$f"
    fi
  done
fi

echo "✅ Initialization complete."
