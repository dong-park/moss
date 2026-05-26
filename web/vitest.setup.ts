import "fake-indexeddb/auto";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { _resetEmbeddingQueue } from "./src/state/ai/embeddingQueue";

afterEach(() => {
  cleanup();
  // 5초 debounce 타이머가 다음 테스트로 새어 나가 닫힌 fake-indexeddb를
  // 건드리는 unhandled rejection을 막기 위해 매 테스트 후 큐를 리셋.
  _resetEmbeddingQueue();
});
