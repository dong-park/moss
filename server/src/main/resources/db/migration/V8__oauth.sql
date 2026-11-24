-- remote-mcp n3: MCP 클라이언트용 OAuth 인가 서버.
-- 웹 세션 JWT와 별개로, MCP 토큰은 불투명 문자열이고 해시만 저장한다. 폐기하면 다음 호출부터 바로 막힌다.

-- 동적 클라이언트 등록(DCR)으로 만든 공개 클라이언트. 메타데이터 문서 클라이언트(https client_id)는 저장하지 않는다.
create table oauth_clients (
    client_id     text primary key,
    client_name   text   not null,
    redirect_uris text   not null, -- JSON 배열 문자열
    created_at    bigint not null
);

-- 사용자가 승인한 연결 하나. 연결된 앱 화면의 한 줄이고, revoked_at이 차면 그 연결의 모든 토큰이 죽는다.
create table oauth_grants (
    id           uuid primary key,
    user_id      uuid   not null references users (id) on delete cascade,
    client_id    text   not null,
    client_name  text   not null,
    resource     text   not null,
    created_at   bigint not null,
    last_used_at bigint,
    revoked_at   bigint
);
create index oauth_grants_user_idx on oauth_grants (user_id);

-- 인가 코드: 한 번만 쓰고 짧게 산다.
create table oauth_codes (
    code_hash      text primary key,
    user_id        uuid   not null references users (id) on delete cascade,
    client_id      text   not null,
    client_name    text   not null,
    redirect_uri   text   not null,
    code_challenge text   not null,
    resource       text   not null,
    expires_at     bigint not null
);

-- 접근 토큰과 갱신 토큰. 갱신 토큰은 쓸 때마다 새로 발급하고 옛것은 consumed_at을 채운다(재사용 감지).
create table oauth_tokens (
    token_hash  text primary key,
    grant_id    uuid   not null references oauth_grants (id) on delete cascade,
    kind        text   not null check (kind in ('access', 'refresh')),
    expires_at  bigint not null,
    consumed_at bigint
);
create index oauth_tokens_grant_idx on oauth_tokens (grant_id);
