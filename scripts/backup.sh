#!/bin/sh
# Postgres와 첨부 볼륨을 날짜별 파일로 덤프한다. DB 이름과 계정은 compose가 .env에서 넣은 컨테이너 값을 쓴다.
set -eu
# 덤프에는 비밀번호 해시가 들어 있다. 소유자만 읽게 만든다.
umask 077

compose="${COMPOSE_FILE:-docker-compose.prod.yml}"
out="${BACKUP_DIR:-./backups}"
stamp="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$out"

# 셸 변수 대신 컨테이너의 POSTGRES_USER·POSTGRES_DB를 쓴다. 따로 export하지 않아도 같은 DB를 덤프한다.
docker compose -f "$compose" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$out/moss-$stamp.dump"

# 볼륨 이름은 compose 프로젝트 이름에 따라 바뀐다. 그 볼륨을 붙인 server 컨테이너에서 바로 묶는다.
docker compose -f "$compose" exec -T server \
  tar -C /data/files -czf - . \
  > "$out/files-$stamp.tar.gz"

test -s "$out/moss-$stamp.dump"
test -s "$out/files-$stamp.tar.gz"
echo "$out/moss-$stamp.dump"
echo "$out/files-$stamp.tar.gz"
