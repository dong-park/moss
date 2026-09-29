import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { _resetEmbeddingQueue } from "./src/state/ai/embeddingQueue";
import {
  __resetBoardDocsForTest,
  __resetBoardNavigatorForTest,
  useWorkspace,
} from "./src/state/workspace";

afterEach(async () => {
  cleanup();
  // n3: 라우터 sink·부팅 플래그가 다음 테스트로 새지 않게 초기화.
  __resetBoardNavigatorForTest();
  useWorkspace.setState({ bootstrapComplete: false });
  // 5초 debounce 타이머가 다음 테스트로 새어 나가 닫힌 fake-indexeddb를
  // 건드리는 unhandled rejection을 막기 위해 매 테스트 후 큐를 리셋.
  _resetEmbeddingQueue();
  // n3: 보드 Y.Doc을 닫고 y-indexeddb 저장소를 비운다. 열린 문서가 다음 테스트
  // 파일까지 살아 있으면 y-indexeddb의 BroadcastChannel로 문서 내용이 새어
  // 스토어 반영 observer가 엉뚱한 Dexie 행을 만든다.
  await __resetBoardDocsForTest();
  if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
    try {
      const dbs = await indexedDB.databases();
      await Promise.all(
        dbs
          .filter((d) => d.name?.startsWith("moss-board-"))
          .map(
            (d) =>
              new Promise<void>((resolve) => {
                if (!d.name) {
                  resolve();
                  return;
                }
                const req = indexedDB.deleteDatabase(d.name);
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
              }),
          ),
      );
    } catch {
      /* databases() 미지원/실패는 무시 — fake-indexeddb 변형 방어 */
    }
  }
});
