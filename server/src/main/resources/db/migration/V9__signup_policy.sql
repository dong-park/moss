-- PR2: 가입 정책. 신규가입 경로(메일, Google)가 같은 행을 잠가 계정 수 상한을 원자적으로 지킨다.
-- 상한 숫자는 여기에 두지 않는다. 설정(MOSS_ACCOUNT_CAP)이 정한다.
create table signup_policy (
    id smallint primary key check (id = 1)
);
insert into signup_policy (id) values (1);

-- 약관 동의 기록. 동의 시각은 서버가 적는다. 이 마이그레이션 전의 계정은 null로 남기고 가짜 기록을 만들지 않는다.
alter table users add column terms_version text;
alter table users add column terms_accepted_at bigint;
