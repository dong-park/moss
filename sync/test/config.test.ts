import { describe, expect, test } from "bun:test";
import { loadConfig, toPgConnection } from "../src/config.ts";

const base = {
  JWT_SECRET: "x".repeat(32),
  SYNC_INTERNAL_SECRET: "internal-secret",
  KTOR_INTERNAL_URL: "http://server:8080",
};

describe("DB 접속", () => {
  // 운영 compose는 비밀번호를 URL에 넣지 않고 따로 넘긴다. base64 비밀번호의 / + = 와 #이 주소를 깨지 않게 한다.
  test("특수문자 비밀번호를 URL 밖에서 그대로 넘긴다", () => {
    const password = "ab/cd+e=#f@g";
    const config = loadConfig({
      ...base,
      DATABASE_URL: "postgres://postgres:5432/moss",
      DATABASE_USER: "moss",
      DATABASE_PASSWORD: password,
    });
    const conn = toPgConnection(config);
    expect(conn.password).toBe(password);
    expect(conn.user).toBe("moss");
    const parsed = new URL(conn.connectionString);
    expect(parsed.hostname).toBe("postgres");
    expect(parsed.port).toBe("5432");
    expect(parsed.pathname).toBe("/moss");
  });

  test("같은 비밀번호를 URL에 넣으면 주소가 깨진다", () => {
    expect(() => new URL("postgres://moss:ab/cd+e=#f@g@postgres:5432/moss")).toThrow();
  });
});
