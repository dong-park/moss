import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { I18nProvider } from "@/i18n/Provider";
import { Canvas } from "@/components/workspace/Canvas";
import { SYSTEM_BOARD_ID, useWorkspace } from "@/state/workspace";
import { useStorage } from "@/state/storage";
import { resetDB } from "@/state/db/schema";
import { flushAll } from "@/state/cardPersist";
import { resetCollabStore } from "@/state/collab";
import { destroyBoardDocs, getActiveBoardDoc } from "@/state/ydoc/activeDoc";
import { noteToYMap, notesMap } from "@/state/ydoc/model";
import type { Note } from "@/state/db/schema";

/**
 * wall-marker 리뷰 W7 — 새 기기에서 공유 벽을 열면 로컬 문서는 비어 있다(원격 카드는 나중에 온다).
 * 그 빈 판정으로 fit을 소진하면 원격 카드가 화면 밖에 있어도 영영 안 맞춰진다. 원격으로 처음
 * 카드가 들어오면(로컬 첫 생성이 아니라) 이 벽의 판정을 풀어 한 번 fit한다.
 */

const CANVAS_W = 800;
const CANVAS_H = 600;
const HOME = { x: 0, y: 0, scale: 1 };

let originalGBCR: typeof Element.prototype.getBoundingClientRect;
let originalStorage: PropertyDescriptor | undefined;

beforeAll(() => {
  originalGBCR = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    return {
      x: 0, y: 0, top: 0, left: 0, right: CANVAS_W, bottom: CANVAS_H,
      width: CANVAS_W, height: CANVAS_H,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = originalGBCR;
});

beforeEach(async () => {
  originalStorage = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    value: {
      persist: vi.fn(async () => true),
      persisted: vi.fn(async () => false),
      estimate: vi.fn(async () => ({ usage: 0, quota: 1000 })),
      getDirectory: vi.fn(),
    },
    configurable: true,
    writable: true,
  });
  resetCollabStore();
  await useStorage.getState().init();
  await useWorkspace.getState().loadFromStorage();
  useWorkspace.setState({
    cards: [],
    selectedIds: [],
    editingId: null,
    viewport: { ...HOME },
    bootstrapComplete: true,
    viewSettledBoardIds: [],
  });
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 20));
  await flushAll().catch(() => undefined);
  await destroyBoardDocs();
  await resetDB();
  resetCollabStore();
  useStorage.setState({ initialized: false, settings: null, quota: null });
  useWorkspace.setState({
    cards: [],
    boards: [],
    currentBoardId: SYSTEM_BOARD_ID,
    viewport: { ...HOME },
    bootstrapComplete: false,
    viewSettledBoardIds: [],
  });
  if (originalStorage) Object.defineProperty(navigator, "storage", originalStorage);
});

function note(id: string, x: number, y: number): Note {
  return {
    id,
    boardId: SYSTEM_BOARD_ID,
    kind: "text",
    x,
    y,
    width: 240,
    rotation: 0,
    content: "",
    aiOptOut: false,
    createdAt: 1,
    updatedAt: 1,
    lastVisitedAt: 1,
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function remoteAdds(...notes: Note[]) {
  const doc = getActiveBoardDoc()!.doc;
  act(() => {
    doc.transact(() => {
      for (const n of notes) notesMap(doc).set(n.id, noteToYMap(n));
    }, { kind: "remote" });
  });
}

describe("W7 · 원격으로 처음 들어온 카드는 이 벽의 첫 fit을 되살린다", () => {
  it("빈 벽으로 열려 판정이 소진된 뒤 원격 카드가 오면 한 번 fit한다", async () => {
    render(
      <I18nProvider locale="ko">
        <Canvas />
      </I18nProvider>,
    );
    await flush();
    // 빈 벽으로 판정됐다 — 뷰포트는 그대로.
    expect(useWorkspace.getState().viewSettledBoardIds).toContain(SYSTEM_BOARD_ID);
    expect(useWorkspace.getState().viewport).toEqual(HOME);

    remoteAdds(note("r1", 4000, 3000));
    await flush();

    expect(useWorkspace.getState().cards.map((c) => c.id)).toEqual(["r1"]);
    expect(useWorkspace.getState().viewport).not.toEqual(HOME);
    expect(useWorkspace.getState().viewSettledBoardIds).toContain(SYSTEM_BOARD_ID);
  });

  it("fit 뒤에 들어오는 원격 카드는 사용자가 정한 화면을 다시 옮기지 않는다", async () => {
    render(
      <I18nProvider locale="ko">
        <Canvas />
      </I18nProvider>,
    );
    await flush();
    remoteAdds(note("r1", 4000, 3000));
    await flush();
    const fitted = useWorkspace.getState().viewport;

    remoteAdds(note("r2", -5000, -4000));
    await flush();
    expect(useWorkspace.getState().viewport).toEqual(fitted);
  });

  it("로컬에서 먼저 만든 카드가 있으면 원격 카드가 와도 fit을 돌리지 않는다(첫 생성이 튀지 않음)", async () => {
    render(
      <I18nProvider locale="ko">
        <Canvas />
      </I18nProvider>,
    );
    await flush();
    // 사용자가 먼저 첫 카드를 만들었다(로컬).
    act(() => {
      useWorkspace.setState({ cards: [{ id: "mine", kind: "text", x: 300, y: 220, width: 240, content: "" }] });
    });
    await flush();
    remoteAdds(note("r1", 4000, 3000));
    await flush();
    expect(useWorkspace.getState().viewport).toEqual(HOME);
  });
});
