-- 공유 보드 안 파일함(하위 보드)은 부모를 기억하고 권한을 부모 체인에서 물려받는다.
-- 멤버 행은 공유 루트에만 있다. 루트를 지우면 하위 보드도 함께 지워진다.
alter table boards add column parent_id text references boards (id) on delete cascade;
create index boards_parent_id_idx on boards (parent_id);
