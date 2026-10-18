import { describe, expect, test } from "bun:test";
import {
  BOARD_FIELDS, CONNECTION_FIELDS, NOTE_FIELDS, readFields, writeFields,
} from "../src/index.ts";

describe("doc-model fields", () => {
  test("메모 필드에 color·textSize·autoWidth가 있고 기기 로컬 필드는 없다", () => {
    expect(NOTE_FIELDS).toContain("color");
    expect(NOTE_FIELDS).toContain("textSize");
    expect(NOTE_FIELDS).toContain("autoWidth");
    expect(NOTE_FIELDS).not.toContain("lastVisitedAt" as never);
    expect(BOARD_FIELDS).not.toContain("lastOpenedAt" as never);
    expect(BOARD_FIELDS).not.toContain("remote" as never);
    expect(new Set(CONNECTION_FIELDS).size).toBe(CONNECTION_FIELDS.length);
  });

  test("writeFields/readFields 왕복: undefined는 키를 만들지 않고 비원시 값은 버린다", () => {
    const store = new Map<string, unknown>();
    writeFields(store as never, { id: "n1", x: 3, color: undefined, title: null }, NOTE_FIELDS);
    expect(store.has("color")).toBe(false);
    store.set("content", { evil: true });
    expect(readFields(store as never, NOTE_FIELDS)).toEqual({ id: "n1", x: 3, title: null });
  });
});
