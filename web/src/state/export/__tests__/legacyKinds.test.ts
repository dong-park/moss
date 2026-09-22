import { describe, expect, it } from "vitest";
import type { NoteKind } from "@/state/db/schema";
import {
  ACCEPTED_LOGICAL_KINDS,
  ALL_NOTE_KINDS,
  LEGACY_NOTE_KINDS,
} from "../legacyKinds";

describe("LEGACY_NOTE_KINDS + 현재 4종", () => {
  it("LEGACY 9 + text/board/frame = NoteKind 전체 (comment는 text+마커)", () => {
    const currentKinds: NoteKind[] = ["text", "board", "frame"];
    const union = new Set([...LEGACY_NOTE_KINDS, ...currentKinds]);
    expect(union.size).toBe(ALL_NOTE_KINDS.length);
    for (const k of ALL_NOTE_KINDS) {
      expect(union.has(k)).toBe(true);
    }
  });

  it("ACCEPTED_LOGICAL_KINDS는 3종 — comment 삭제됨", () => {
    expect(ACCEPTED_LOGICAL_KINDS).toEqual(["text", "board", "frame"]);
  });
});
