#!/bin/sh
# Postgres와 첨부 볼륨을 날짜별 파일로 덤프한다. 비밀번호는 환경 변수로만 받는다.
set -eu

compose="${COMPOSE_FILE:-docker-compose.prod.yml}"
out="${BACKUP_DIR:-./backups}"
stamp="$(date +%Y%m%d-%H%M%S)"
db="${POSTGRES_DB:-moss}"
user="${POSTGRES_USER:?POSTGRES_USER is required}"

mkdir -p "$out"

docker compose -f "$compose" exec -T postgres \
  pg_dump -U "$user" -d "$db" --format=custom \
  > "$out/moss-$stamp.dump"

docker run --rm \
  -v moss_filedata:/data:ro \
  -v "$out:/out" \
  alpine:3.20 \
  tar -C /data -czf "/out/files-$stamp.tar.gz" .

test -s "$out/moss-$stamp.dump"
echo "$out/moss-$stamp.dump"
echo "$out/files-$stamp.tar.gz"
