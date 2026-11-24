import { describe, expect, test } from "bun:test";
import pg from "pg";
import { loadConfig, toPgConnection } from "../src/config.ts";

const base = {
  JWT_SECRET: "x".repeat(32),
  SYNC_INTERNAL_SECRET: "internal-secret",
  KTOR_INTERNAL_URL: "http://server:8080",
};

/** pg Client가 실제로 쓰는 접속 값. 타입 선언에는 없지만 런타임에 있다. */
type ConnectionParameters = { user: string; password: string; host: string; port: number; database: string };

/** 실제 pg 클라이언트가 접속에 쓸 값. 중간 객체가 아니라 pg가 읽은 결과를 본다. */
function effective(env: Record<string, string>) {
  const client = new pg.Client(toPgConnection(loadConfig({ ...base, ...env })));
  const params = (client as unknown as { connectionParameters: ConnectionParameters }).connectionParameters;
  return { user: params.user, password: params.password, host: params.host, port: params.port, database: params.database };
}

describe("DB 접속", () => {
  // 운영 compose는 비밀번호를 URL에 넣지 않고 따로 넘긴다. base64 비밀번호의 / + = 와 # @ % 가 주소를 깨면 안 된다.
  test("따로 넘긴 사용자와 특수문자 비밀번호를 pg가 그대로 쓴다", () => {
    const password = "ab/cd+e=#f@g%41";
    expect(
      effective({ DATABASE_URL: "postgres://postgres:5432/moss", DATABASE_USER: "moss_prod", DATABASE_PASSWORD: password }),
    ).toEqual({ user: "moss_prod", password, host: "postgres", port: 5432, database: "moss" });
  });

  test("JDBC 주소와 URL 안 계정도 따로 넘긴 값이 이긴다", () => {
    expect(
      effective({ DATABASE_URL: "jdbc:postgresql://old:old@postgres:5432/moss", DATABASE_USER: "moss", DATABASE_PASSWORD: "new" }),
    ).toEqual({ user: "moss", password: "new", host: "postgres", port: 5432, database: "moss" });
  });

  test("따로 넘긴 값이 없으면 URL 안 계정을 쓴다", () => {
    expect(effective({ DATABASE_URL: "postgres://moss:moss@postgres:5432/moss" })).toEqual({
      user: "moss",
      password: "moss",
      host: "postgres",
      port: 5432,
      database: "moss",
    });
  });
});
