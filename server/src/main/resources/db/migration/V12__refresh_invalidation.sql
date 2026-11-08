-- 비밀번호를 바꾼 시각. 이 시각 이전에 발급한 리프레시 토큰은 갱신하지 않는다.
create table refresh_invalidations (
    user_id uuid primary key references users (id),
    invalid_before bigint not null
);
