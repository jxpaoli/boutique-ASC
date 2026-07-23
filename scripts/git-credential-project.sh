#!/bin/sh
# Credential helper scopé au projet : sert le jeton GitHub lu depuis .env.project.local.
if [ "$1" = "get" ]; then
  root="$(cd "$(dirname "$0")/.." && pwd)"
  token=$(grep '^GITHUB_TOKEN=' "$root/.env.project.local" | cut -d= -f2- | tr -d '\r ')
  [ -n "$token" ] || exit 0
  echo "username=jxpaoli"
  echo "password=$token"
fi
