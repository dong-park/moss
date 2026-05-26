import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { useSignals } from "../useSignals";
import { useStorage } from "@/state/storage";
import { getDB, resetDB, type Note } from "@/state/db/schema";
import type { SignalsState } from "../types";

function makeNote(overrides: Partial<Note> & { id: string; content: string }): Note {
  return {
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    aiOptOut: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastVisitedAt: Date.now(),
    ...overrides,
  };
}

let lastState: SignalsState | null = null;
function Probe() {
  const state = useSignals(true);
  // 렌더 중 외부 변수 재할당은 side-effect(react-hooks/globals) → effect에서 캡처.
  useEffect(() => {
    lastState = state;
  });
  return <output data-testid="status">{state.status}</output>;
}

beforeEach(async () => {
  lastState = null;
  await resetDB();
  await useStorage.getState().init();
});

afterEach(async () => {
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
});

describe("useSignals", () => {
  test("DB가 비어있으면 status: 'empty'", async () => {
    const { getByTestId } = render(<Probe />);
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("empty");
    });
  });

  test("메모 10개 미만이면 status: 'empty'와 total", async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await getDB().notes.put(
        makeNote({ id: `n${i}`, content: `생각 ${i}`, createdAt: now }),
      );
    }
    render(<Probe />);
    await waitFor(() => {
      expect(lastState).toMatchObject({ status: "empty", total: 5 });
    });
  });

  test("메모 10개 이상이면 status: 'ready'와 keywords/rhythm", async () => {
    const now = Date.now();
    for (let i = 0; i < 12; i++) {
      await getDB().notes.put(
        makeNote({
          id: `n${i}`,
          content: `신뢰는 안심에서 시작 ${i}`,
          createdAt: now,
        }),
      );
    }
    render(<Probe />);
    await waitFor(() => {
      expect(lastState?.status).toBe("ready");
    });
    if (lastState?.status === "ready") {
      expect(lastState.total).toBe(12);
      expect(lastState.keywords.length).toBeGreaterThan(0);
      expect(lastState.rhythm).toHaveLength(24);
      expect(lastState.keywords.some((k) => k.token === "신뢰는")).toBe(true);
    }
  });

  test("aiOptOut=true 노트는 집계에서 제외", async () => {
    const now = Date.now();
    for (let i = 0; i < 8; i++) {
      await getDB().notes.put(
        makeNote({ id: `n${i}`, content: `생각 ${i}`, createdAt: now }),
      );
    }
    for (let i = 0; i < 5; i++) {
      await getDB().notes.put(
        makeNote({
          id: `opt${i}`,
          content: `비공개 ${i}`,
          createdAt: now,
          aiOptOut: true,
        }),
      );
    }
    render(<Probe />);
    await waitFor(() => {
      expect(lastState).toMatchObject({ status: "empty", total: 8 });
    });
  });

  test("aiOptOutGlobal=true면 status: 'opt-out' (DB 무관)", async () => {
    await useStorage.getState().updateSettings({ aiOptOutGlobal: true });
    render(<Probe />);
    await waitFor(() => {
      expect(lastState?.status).toBe("opt-out");
    });
  });

  test("7일 보다 오래된 메모는 제외", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < 15; i++) {
      await getDB().notes.put(
        makeNote({ id: `old${i}`, content: `옛 ${i}`, createdAt: eightDaysAgo }),
      );
    }
    render(<Probe />);
    await waitFor(() => {
      expect(lastState).toMatchObject({ status: "empty", total: 0 });
    });
  });

  test("패널 열린 상태에서 메모 추가 시 자동 재계산 (liveQuery)", async () => {
    const now = Date.now();
    for (let i = 0; i < 12; i++) {
      await getDB().notes.put(
        makeNote({ id: `n${i}`, content: `기존 ${i}`, createdAt: now }),
      );
    }
    render(<Probe />);
    await waitFor(() => {
      expect(lastState?.status).toBe("ready");
    });
    if (lastState?.status !== "ready") throw new Error("not ready");
    const initialTotal = lastState.total;
    await getDB().notes.put(
      makeNote({ id: "new", content: "추가된 새 메모", createdAt: now }),
    );
    await waitFor(() => {
      if (lastState?.status !== "ready") throw new Error("not ready");
      expect(lastState.total).toBe(initialTotal + 1);
    });
  });

  test("enabled=false면 구독 없이 'empty' 유지", async () => {
    const now = Date.now();
    for (let i = 0; i < 12; i++) {
      await getDB().notes.put(
        makeNote({ id: `n${i}`, content: `생각 ${i}`, createdAt: now }),
      );
    }
    function DisabledProbe() {
      const state = useSignals(false);
      useEffect(() => {
        lastState = state;
      });
      return <output>{state.status}</output>;
    }
    render(<DisabledProbe />);
    // 구독을 시작하지 않으므로 notes가 null → 'empty'
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(lastState?.status).toBe("empty");
  });
});
