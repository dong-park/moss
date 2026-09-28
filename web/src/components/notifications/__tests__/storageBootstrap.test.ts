import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useStorage } from "@/state/storage";
import { useWorkspace } from "@/state/workspace";
import { resetDB } from "@/state/db/schema";

/**
 * FEAT-collab-auth n23 작업 4 — 부팅 예산.
 * 이전이 3초(테스트는 20ms)를 넘기면 부팅을 이어가고, 끝난 뒤 스토어를 다시 읽는다.
 * 타임아웃 시 문서 핸들 누수 0은 dexieMigration.test.ts P1-3b가 검증한다.
 */

vi.mock("@/state/db/dexieMigration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/state/db/dexieMigration")>();
  return { ...actual, migrateDexieBoards: vi.fn() };
});

function emptyResult() {
  return {
    migrated: [],
    failed: [],
    alreadyDone: [],
    atFailureLimit: [],
    migratedDocs: [],
    migrationFailures: {},
    dexieMigrationVersion: 1,
  };
}

const originalLoad = useWorkspace.getState().loadFromStorage;
const originalUpdate = useStorage.getState().updateSettings;

beforeEach(() => {
  useWorkspace.setState({ migrationPending: false });
});

afterEach(async () => {
  useWorkspace.setState({ loadFromStorage: originalLoad, migrationPending: false });
  useStorage.setState({ updateSettings: originalUpdate });
  await resetDB();
});

describe("n23 작업 4 — 부팅 예산", () => {
  it("이전이 예산을 넘기면 부팅을 이어가고, 끝난 뒤 스토어를 다시 읽는다", async () => {
    const loadSpy = vi.fn(async () => {});
    const updateSpy = vi.fn(async () => {});
    useWorkspace.setState({ loadFromStorage: loadSpy });
    useStorage.setState({ updateSettings: updateSpy });

    let resolveMigration!: () => void;
    const pending = new Promise<void>((r) => {
      resolveMigration = r;
    });
    const { migrateDexieBoards } = await import("@/state/db/dexieMigration");
    (migrateDexieBoards as Mock).mockReturnValue(pending.then(emptyResult));

    const { runBootstrap } = await import("@/components/notifications/StorageBootstrap");
    const running = runBootstrap(20);

    await new Promise((r) => setTimeout(r, 50));
    // 예산 초과 → 로딩 표시가 켜지고 첫 로드는 이미 끝났다.
    expect(useWorkspace.getState().migrationPending).toBe(true);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    resolveMigration();
    await running;
    // 이전이 끝난 뒤 다시 읽고 로딩 표시를 끈다.
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(useWorkspace.getState().migrationPending).toBe(false);
  });

  it("이전이 예산 안에 끝나면 로딩 표시 없이 한 번만 읽는다", async () => {
    const loadSpy = vi.fn(async () => {});
    useWorkspace.setState({ loadFromStorage: loadSpy });
    useStorage.setState({ updateSettings: vi.fn(async () => {}) });

    const { migrateDexieBoards } = await import("@/state/db/dexieMigration");
    (migrateDexieBoards as Mock).mockResolvedValue(emptyResult());

    const { runBootstrap } = await import("@/components/notifications/StorageBootstrap");
    await runBootstrap(1000);

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(useWorkspace.getState().migrationPending).toBe(false);
  });
});
