-- 웹 로컬 보드 id(`b-…`)를 그대로 공유하도록 보드 id를 불투명 문자열로 바꾼다.
-- 형식(^[A-Za-z0-9_-]{1,64}$)은 앱의 parseBoardId와 sync의 isBoardId가 검증한다.
-- FK가 걸린 컬럼은 타입을 함께 바꿔야 하므로 FK를 내렸다가 다시 건다.
alter table members drop constraint members_board_id_fkey;
alter table invites drop constraint invites_board_id_fkey;
alter table files drop constraint files_board_id_fkey;

alter table boards alter column id type text using id::text;
alter table members alter column board_id type text using board_id::text;
alter table invites alter column board_id type text using board_id::text;
alter table files alter column board_id type text using board_id::text;

alter table members add constraint members_board_id_fkey
    foreign key (board_id) references boards (id) on delete cascade;
alter table invites add constraint invites_board_id_fkey
    foreign key (board_id) references boards (id) on delete cascade;
alter table files add constraint files_board_id_fkey
    foreign key (board_id) references boards (id) on delete cascade;
