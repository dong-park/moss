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

# 볼륨 이름은 compose 프로젝트 이름에 따라 바뀐다. 그 볼륨을 붙인 server 컨테이너에서 바로 묶는다.
docker compose -f "$compose" exec -T server \
  tar -C /data/files -czf - . \
  > "$out/files-$stamp.tar.gz"

test -s "$out/moss-$stamp.dump"
test -s "$out/files-$stamp.tar.gz"
echo "$out/moss-$stamp.dump"
echo "$out/files-$stamp.tar.gz"
