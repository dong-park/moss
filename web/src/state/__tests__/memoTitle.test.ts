import { beforeEach, describe, expect, it } from "vitest";
import {
  MEMO_TITLE_MAX_LENGTH,
  normalizeTitle,
} from "@/state/memoTitle";
import { useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";

beforeEach(async () => {
  await resetDB();
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
});

describe("normalizeTitle — 제목 정규화 (spec §4)", () => {
  it("앞뒤 공백을 자른다", () => {
    expect(normalizeTitle("  주간 회고  ")).toBe("주간 회고");
  });

  it("줄바꿈·탭은 공백 한 칸으로 바꾼다", () => {
    expect(normalizeTitle("첫줄\n둘째줄\t셋째")).toBe("첫줄 둘째줄 셋째");
    expect(normalizeTitle("a\r\nb")).toBe("a b");
  });

  it("80자에서 자른다", () => {
    const long = "가".repeat(90);
    expect(normalizeTitle(long)).toBe("가".repeat(MEMO_TITLE_MAX_LENGTH));
    expect(normalizeTitle(long).length).toBe(80);
  });

  it("자른 뒤 비면 빈 문자열 — 공백 문자열을 저장하지 않는다(AC-2)", () => {
    expect(normalizeTitle("   ")).toBe("");
    expect(normalizeTitle("\n\t")).toBe("");
  });
});

describe("setTitle — 저장 경로 (AC-1·AC-2)", () => {
  it("제목을 달면 카드와 저장소에 반영된다", async () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setTitle(id, "  주간 회고 ");
    await new Promise((r) => setTimeout(r, 320));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.title).toBe("주간 회고");

    // 새 세션 복원
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const restored = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(restored?.title).toBe("주간 회고");
  });

  it("빈 제목은 undefined로 저장된다", async () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setTitle(id, "임시");
    useWorkspace.getState().setTitle(id, "   ");
    await new Promise((r) => setTimeout(r, 320));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.title).toBeUndefined();
  });
});

describe("임베딩 입력 — 제목 포함 (AC-9)", () => {
  it("제목+빈줄+본문이 입력되고 제목만 바뀌면 해시가 달라진다", async () => {
    const { contentHash } = await import("@/state/ai/hash");
    const a = "제목입니다\n\n본문";
    const b = "다른 제목\n\n본문";
    expect(await contentHash(a)).not.toBe(await contentHash(b));
  });
});
