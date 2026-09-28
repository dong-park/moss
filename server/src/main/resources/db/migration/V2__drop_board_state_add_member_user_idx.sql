-- n4 리뷰 반영: 값이 하나뿐이고 읽는 곳이 없는 상태 컬럼 제거, /me/boards용 user_id 인덱스.
alter table boards drop constraint boards_state_check;
alter table boards drop column state;
create index members_user_id_idx on members (user_id);
