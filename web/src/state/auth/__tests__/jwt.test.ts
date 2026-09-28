import { describe, expect, test } from "vitest";
import { decodeJwtPayload, isExpired } from "../jwt";

function makeToken(payload: Record<string, unknown>): string {
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.signature`;
}

describe("auth/jwt", () => {
  test("payload를 디코딩한다", () => {
    const token = makeToken({ sub: "u1", typ: "board", boardId: "b1", exp: 100 });
    expect(decodeJwtPayload(token)).toEqual({ sub: "u1", typ: "board", boardId: "b1", exp: 100 });
  });

  test("JWT 형식이 아니면 null", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.%%%.c")).toBeNull();
  });

  test("exp가 미래면 만료 아님", () => {
    const now = 1_000_000;
    const token = makeToken({ exp: (now + 60_000) / 1000 });
    expect(isExpired(token, 0, now)).toBe(false);
  });

  test("exp가 과거면 만료", () => {
    const now = 1_000_000;
    const token = makeToken({ exp: (now - 1) / 1000 });
    expect(isExpired(token, 0, now)).toBe(true);
  });

  test("skew 안쪽이면 만료로 본다", () => {
    const now = 1_000_000;
    const token = makeToken({ exp: (now + 10_000) / 1000 });
    expect(isExpired(token, 30_000, now)).toBe(true);
  });

  test("exp가 없으면 만료로 취급", () => {
    expect(isExpired(makeToken({ sub: "u1" }), 0, 1_000_000)).toBe(true);
  });
});
