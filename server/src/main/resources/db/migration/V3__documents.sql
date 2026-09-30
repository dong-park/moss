-- n5 리뷰 반영: sync 서버가 런타임 DDL로 만들던 documents 테이블을 Flyway로 이관.
-- name은 Hocuspocus 문서 이름(=보드 id)이고, 행 삭제는 공유 해제(AC-13)를 뜻한다.
-- `if not exists`: 이전 n5 빌드(sync의 migrate())가 이미 만든 DB에서도 Flyway가 통과해야 한다.
create table if not exists documents (
    name text primary key,
    data bytea not null,
    updated_at bigint not null
);
