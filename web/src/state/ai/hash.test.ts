import { describe, test, expect } from "vitest";
import { contentHash } from "./hash";

describe("contentHash", () => {
  test("동일 입력 → 동일 해시 (결정성)", async () => {
    const a = await contentHash("머무는 생각");
    const b = await contentHash("머무는 생각");
    expect(a).toBe(b);
  });

  test("미세 변경도 다른 해시", async () => {
    const a = await contentHash("hello");
    const b = await contentHash("hello ");
    expect(a).not.toBe(b);
  });

  test("빈 문자열도 안정적 해시 반환", async () => {
    const empty = await contentHash("");
    expect(empty).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(empty.length).toBeGreaterThan(0);
  });

  test("base64 형식", async () => {
    const h = await contentHash("any");
    expect(h).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
