"use client";

import { useEffect } from "react";
import { useStorage } from "@/state/storage";
import { useQuotaWatcher } from "@/state/quota-watcher";
import { useWorkspace } from "@/state/workspace";
import { startMossBridge } from "@/state/bridge/mossBridge";
import { getDB } from "@/state/db/schema";
import { migrateDexieBoards, withMigrationLock } from "@/state/db/dexieMigration";
import { migrateSystemBoard } from "@/state/db/systemBoardMigration";

/**
 * n23 작업 4: 부팅 예산. 이전이 이 시간 안에 끝나면 그대로 진행하고, 넘기면 로딩
 * 표시를 띄운 채 부팅을 이어간다 — 이전이 끝나면 스토어를 다시 읽어 갱신한다.
 */
export const MIGRATION_BOOT_BUDGET_MS = 3000;

/**
 * Dexie→Yjs 이전을 Web Lock 안에서 돌리고 settings 기록까지 같은 락에 묶는다.
 * 실패·타임아웃이어도 부팅은 막지 않는다(보드 단위 격리, 다음 실행에 재시도).
 */
async function runMigrationLocked(): Promise<void> {
  try {
    await withMigrationLock(async () => {
      const result = await migrateDexieBoards(getDB());
      await useStorage.getState().updateSettings({
        migratedDocs: result.migratedDocs,
        migrationFailures: result.migrationFailures,
        dexieMigrationVersion: result.dexieMigrationVersion,
      });
      // n1: 시스템 보드를 UUID id의 평범한 보드 행으로 이전한다. Dexie→Yjs 이전
      // 뒤에 이어 돈다(둘 다 끝나야 시스템 보드 문서가 최종 위치에 놓인다).
      await migrateSystemBoard(getDB());
    });
  } catch (err) {
    console.warn("[moss] Dexie → Yjs 이전을 건너뜁니다", err);
  }
}

/** 부팅 예산을 걸고 이전·워크스페이스 로드를 순서대로 돌린다. 테스트에서 직접 부른다. */
export async function runBootstrap(budgetMs = MIGRATION_BOOT_BUDGET_MS): Promise<void> {
  const migration = runMigrationLocked();
  let finished = false;
  const budget = new Promise<void>((resolve) => {
    setTimeout(resolve, budgetMs);
  });
  await Promise.race([
    migration.then(() => {
      finished = true;
    }),
    budget,
  ]);

  if (!finished) useWorkspace.setState({ migrationPending: true });
  await useWorkspace.getState().loadFromStorage();

  if (!finished) {
    // 이전이 끝나면 스토어를 다시 읽는다 — 그사이 채워진 문서를 반영.
    await migration;
    await useWorkspace.getState().loadFromStorage();
    useWorkspace.setState({ migrationPending: false });
  }
}

/**
 * 앱 진입 시 storage init + workspace 로드 + quota 폴링을 시작한다.
 * NEXT_PUBLIC_MOSS_BRIDGE=1 이면 외부 MCP용 데이터 브리지도 함께 연다(멱등·게이트).
 */
export function StorageBootstrap() {
  const initialized = useStorage((s) => s.initialized);
  const init = useStorage((s) => s.init);
  const loadFromStorage = useWorkspace((s) => s.loadFromStorage);
  const migrationPending = useWorkspace((s) => s.migrationPending);

  useEffect(() => {
    if (initialized) return;
    void (async () => {
      await init();
      await runBootstrap();
      startMossBridge();
    })();
  }, [initialized, init, loadFromStorage]);

  useQuotaWatcher();

  if (!migrationPending) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
        color: "#fff",
        zIndex: 9999,
        // n23 재심사 2R-1: 오버레이는 표시 전용이다. 이전 중 보드 전환 차단은
        // 스토어 진입부(setCurrentBoard·보드 생성)의 migrationPending 가드가 맡는다 —
        // 오버레이가 포인터를 잡으면 앱 전체가 잠기고 단축키는 통과해 구멍이 남는다.
        pointerEvents: "none",
      }}
    >
      {/* 이전이 부팅 예산을 넘길 때만 잠깐 보인다. */}
      이전하는 중이에요…
    </div>
  );
}
