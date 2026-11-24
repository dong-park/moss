import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Client } from "pg";
import { MemoryDocumentStore } from "../src/documentStore.ts";
import { createPostgresBoardSource, MAX_LISTED_BOARDS } from "../src/mcpBoards.ts";
import { startEmbeddedPg, type EmbeddedPgHandle } from "./helpers.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("createPostgresBoardSource (embedded Postgres)", () => {
  let pgHandle: EmbeddedPgHandle;
  let client: Client;

  beforeAll(async () => {
    pgHandle = await startEmbeddedPg();
    client = pgHandle.pg.getPgClient();
    await client.connect();
    // Same columns as the Flyway migrations V1, V4 and V6.
    await client.query(`
      create table boards (id text primary key, name text not null, parent_id text references boards (id));
      create table members (board_id text not null references boards (id), user_id uuid not null, role text not null);
      create table files (id uuid primary key, board_id text not null references boards (id), name text not null);
      insert into boards (id, name, parent_id) values
        ('b-mine', '내 보드', null), ('b-shared', '공유 보드', null),
        ('b-child', '내 보드 안 파일함', 'b-mine'), ('b-grand', '파일함 안 파일함', 'b-child'),
        ('b-theirs', '남의 보드', null), ('b-theirs-child', '남의 파일함', 'b-theirs');
      insert into members (board_id, user_id, role) values
        ('b-mine', '${ME}', 'owner'), ('b-shared', '${ME}', 'editor'),
        ('b-theirs', '${OTHER}', 'owner'), ('b-shared', '${OTHER}', 'owner');
      insert into files (id, board_id, name) values
        ('33333333-3333-4333-8333-333333333333', 'b-mine', '표지.png');
    `);
  });

  afterAll(async () => {
    await client.end();
    await pgHandle.stop();
  });

  test("lists member boards plus the boards nested inside them, and no one else's", async () => {
    const source = createPostgresBoardSource(client, new MemoryDocumentStore());
    const boards = await source.listBoards(ME);
    expect(boards.map((board) => board.id).sort()).toEqual(["b-child", "b-grand", "b-mine", "b-shared"]);
    const grand = boards.find((board) => board.id === "b-grand");
    expect(grand).toEqual({ id: "b-grand", name: "파일함 안 파일함", parentId: "b-child", role: "owner" });
    expect(boards.find((board) => board.id === "b-shared")?.role).toBe("editor");
    expect(await source.listBoards("99999999-9999-4999-8999-999999999999")).toEqual([]);
  });

  test("a member of many boards gets the first ones by name, plus one extra so the cut is visible", async () => {
    const many = "44444444-4444-4444-8444-444444444444";
    const total = MAX_LISTED_BOARDS + 5;
    await client.query(
      `insert into boards (id, name) select 'b-bulk' || lpad(i::text, 4, '0'), 'z보드 ' || lpad(i::text, 4, '0') from generate_series(1, $1) i`,
      [total],
    );
    await client.query(
      `insert into members (board_id, user_id, role) select 'b-bulk' || lpad(i::text, 4, '0'), $2::uuid, 'owner' from generate_series(1, $1) i`,
      [total, many],
    );
    const boards = await createPostgresBoardSource(client, new MemoryDocumentStore()).listBoards(many);
    expect(boards).toHaveLength(MAX_LISTED_BOARDS + 1);
    expect(boards[0]?.name).toBe("z보드 0001");
    expect(boards.at(-1)?.name).toBe("z보드 " + String(MAX_LISTED_BOARDS + 1).padStart(4, "0"));
  });

  test("maps file ids to names for one board", async () => {
    const source = createPostgresBoardSource(client, new MemoryDocumentStore());
    expect(await source.fileNames("b-mine")).toEqual(new Map([["33333333-3333-4333-8333-333333333333", "표지.png"]]));
    expect((await source.fileNames("b-shared")).size).toBe(0);
  });
});
