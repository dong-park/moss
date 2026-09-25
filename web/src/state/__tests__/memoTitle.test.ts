import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MEMO_TITLE_MAX_LENGTH,
  normalizeTitle,
  normalizeTitleTyping,
} from "@/state/memoTitle";
import { useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";

beforeEach(async () => {
  await resetDB();
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
});

// 다음 테스트의 resetDB가 닫은 DB에 대기 중 디바운스 영속이 쓰지 않게 먼저 내보낸다.
afterEach(async () => {
  await flushAll();
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

describe("normalizeTitleTyping — 타이핑용 정규화 (AC-7)", () => {
  it("앞뒤 공백을 살려 둔다 — '주간 ' 뒤에 이어 칠 수 있다", () => {
    expect(normalizeTitleTyping("주간 ")).toBe("주간 ");
    expect(normalizeTitleTyping("  주간")).toBe("  주간");
  });

  it("줄바꿈·탭은 칠 때 바로 공백 한 칸으로 바꾼다", () => {
    expect(normalizeTitleTyping("첫줄\n둘째\t셋째")).toBe("첫줄 둘째 셋째");
  });

  it("80자 상한은 칠 때 걸린다", () => {
    expect(normalizeTitleTyping("가".repeat(90))).toBe(
      "가".repeat(MEMO_TITLE_MAX_LENGTH),
    );
  });
});

describe("setTitle / commitTitle — 저장 경로 (AC-1·AC-7)", () => {
  it("setTitle은 타이핑 값(공백 포함)을 그대로 반영한다", () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setTitle(id, "주간 ");
    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.title).toBe("주간 ");
  });

  it("commitTitle이 앞뒤 공백을 자르고 저장소에 반영한다", async () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setTitle(id, "  주간 회고 ");
    useWorkspace.getState().commitTitle(id);
    await new Promise((r) => setTimeout(r, 20));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.title).toBe("주간 회고");

    // 새 세션 복원 — 확정 값이 영속됐는지.
    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const restored = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(restored?.title).toBe("주간 회고");
  });

  it("빈 제목은 commitTitle 후 undefined로 저장된다", async () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setTitle(id, "임시");
    useWorkspace.getState().setTitle(id, "   ");
    useWorkspace.getState().commitTitle(id);
    await new Promise((r) => setTimeout(r, 20));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.title).toBeUndefined();
  });

  // 위키링크 자동완성 "새 메모" 확정이 타는 경로(setTitle → commitTitle)를
  // 스토어 수준에서 고정한다 — 본문은 비고 제목만 남아야 한다(성공 기준 12·13).
  it("새 메모 제목 경로 — 제목만 저장·새로고침 뒤에도 유지, 본문은 빈 문자열", async () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setTitle(id, "  기획안  ");
    useWorkspace.getState().commitTitle(id);
    await new Promise((r) => setTimeout(r, 20));

    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.title).toBe("기획안");
    expect(card?.content).toBe("");

    useStorage.setState({ initialized: false, settings: null, quota: null });
    useWorkspace.setState({ cards: [], selectedIds: [], editingId: null });
    await useStorage.getState().init();
    await useWorkspace.getState().loadFromStorage();
    const restored = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(restored?.title).toBe("기획안");
  });

  it("80자를 넘는 질의는 정규화 규칙대로 잘린 제목이 된다", () => {
    const id = useWorkspace.getState().addCardAt("text", 0, 0);
    useWorkspace.getState().setTitle(id, "가".repeat(90));
    useWorkspace.getState().commitTitle(id);
    const card = useWorkspace.getState().cards.find((c) => c.id === id);
    expect(card?.title).toBe("가".repeat(MEMO_TITLE_MAX_LENGTH));
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
