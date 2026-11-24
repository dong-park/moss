-- 비밀번호 재설정 일회용 토큰. 원문은 저장하지 않고 SHA-256 해시만 둔다.
create table password_resets (
    token_hash text primary key,
    user_id uuid not null references users (id),
    expires_at bigint not null,
    used_at bigint,
    created_at bigint not null
);

create index password_resets_user_id_idx on password_resets (user_id);
