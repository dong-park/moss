-- FEAT-email-auth D1/D9: 메일 가입 계정을 같은 users 테이블에 담는다.
-- google_sub와 password_hash 중 하나는 반드시 있어야 한다(D1).
-- email_verified_at은 지금은 늘 null이고, 메일 인증이 생기면 채운다(D9).
alter table users alter column google_sub drop not null;
alter table users add column email text;
alter table users add column password_hash text;
alter table users add column email_verified_at bigint;

-- Postgres 고유 인덱스는 NULL을 서로 다르게 보므로 Google 계정(email null)이 여럿이어도 된다.
create unique index users_email_idx on users (email);

alter table users add constraint users_identity_check
    check (google_sub is not null or password_hash is not null);
