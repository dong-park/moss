import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDB } from "@/state/db/schema";

/**
 * FEAT-collab-auth n23 작업 6(b) — activateBoardDoc는 whenLoaded 성공 뒤에
 * activeKey를 바꾸고, 실패하면 이전 활성 키로 되돌린다.
 *
 * openBoardDoc을 mock해야 하므로 resetModules 뒤 동적 import로 문서 모듈을 새로
 * 평가한다(vitest.setup이 미리 로드한 doc 캐시를 우회).
 */

const { failKeys } = vi.hoisted(() => ({ failKeys: new Set<string>() }));

beforeEach(() => {
  failKeys.clear();
  vi.resetModules();
});

afterEach(async () => {
  const { destroyBoardDocs } = await import("@/state/ydoc/activeDoc");
  await destroyBoardDocs();
  await resetDB();
});

describe("n23 작업 6(b) — activateBoardDoc 실패 롤백", () => {
  it("whenLoaded 실패면 이전 활성 보드가 유지된다", async () => {
    vi.doMock("@/state/ydoc/doc", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/state/ydoc/doc")>();
      return {
        ...actual,
        openBoardDoc: (boardId: string) => {
          const handle = actual.openBoardDoc(boardId);
          if (failKeys.has(boardId)) {
            return { ...handle, whenLoaded: Promise.reject(new Error("open failed")) };
          }
          return handle;
        },
      };
    });

    const { activateBoardDoc, isActiveBoard } = await import("@/state/ydoc/activeDoc");
    await activateBoardDoc(null);
    expect(isActiveBoard(null)).toBe(true);

    failKeys.add("bad");
    await expect(activateBoardDoc("bad")).rejects.toThrow("open failed");
    expect(isActiveBoard(null)).toBe(true);
    expect(isActiveBoard("bad")).toBe(false);
  });

  it("P1-4: 실패한 핸들은 캐시에서 버려져 재시도가 성공한다", async () => {
    vi.doMock("@/state/ydoc/doc", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/state/ydoc/doc")>();
      return {
        ...actual,
        openBoardDoc: (boardId: string) => {
          const handle = actual.openBoardDoc(boardId);
          if (failKeys.has(boardId)) {
            return { ...handle, whenLoaded: Promise.reject(new Error("open failed")) };
          }
          return handle;
        },
      };
    });

    const { activateBoardDoc, isActiveBoard } = await import("@/state/ydoc/activeDoc");

    failKeys.add("bad");
    await expect(activateBoardDoc("bad")).rejects.toThrow("open failed");

    // 실패 핸들이 버려졌으므로 새로 열어 재시도가 성공한다.
    failKeys.delete("bad");
    const handle = await activateBoardDoc("bad");
    await handle.whenLoaded;
    expect(isActiveBoard("bad")).toBe(true);
  });
});
