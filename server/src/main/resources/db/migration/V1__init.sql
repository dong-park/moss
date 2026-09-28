-- FEAT-collab-auth n4: users, boards, members, invites, files (metadata only).
-- created_at columns are epoch milliseconds (bigint) to keep the JVM mapping simple.

create table users (
    id uuid primary key,
    google_sub text not null unique,
    name text not null,
    avatar text,
    created_at bigint not null
);

create table boards (
    id uuid primary key,
    owner_id uuid not null references users (id),
    name text not null,
    state text not null default 'shared',
    created_at bigint not null,
    constraint boards_state_check check (state in ('shared'))
);

create table members (
    board_id uuid not null references boards (id) on delete cascade,
    user_id uuid not null references users (id) on delete cascade,
    role text not null,
    created_at bigint not null,
    primary key (board_id, user_id),
    constraint members_role_check check (role in ('owner', 'editor'))
);

-- Exactly one owner membership per board. Enforced by the application (boards.owner_id
-- + insert), but the partial unique index makes a second owner impossible at the DB level.
create unique index members_single_owner_idx on members (board_id) where role = 'owner';

create table invites (
    token text primary key,
    board_id uuid not null references boards (id) on delete cascade,
    created_at bigint not null,
    revoked_at bigint
);

create index invites_board_id_idx on invites (board_id);

-- Metadata only; n10 adds the upload/download endpoints and the disk volume.
create table files (
    id uuid primary key,
    board_id uuid not null references boards (id) on delete cascade,
    name text not null,
    size bigint not null,
    content_type text,
    created_at bigint not null
);

create index files_board_id_idx on files (board_id);
