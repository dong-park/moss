-- 로그아웃으로 폐기한 리프레시 토큰. 원문은 저장하지 않고 jti의 SHA-256만 둔다.
create table revoked_refresh_tokens (
    jti_hash text primary key,
    user_id uuid not null references users (id),
    expires_at bigint not null,
    revoked_at bigint not null
);

create index revoked_refresh_tokens_expires_at_idx on revoked_refresh_tokens (expires_at);
