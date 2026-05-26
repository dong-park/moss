import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  configureEmbeddingQueue,
  enqueueEmbed,
  flushNow,
  _resetEmbeddingQueue,
} from "./embeddingQueue";
import { getDB } from "../db/schema";

const successFetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
  const body = JSON.parse((init?.body as string) ?? "{}") as { texts: string[] };
  return new Response(
    JSON.stringify({
      vectors: body.texts.map(() => new Array(1024).fill(0.001)),
      tokensUsed: 0,
      mocked: true,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

beforeEach(async () => {
  _resetEmbeddingQueue();
  successFetcher.mockClear();
  // 각 테스트 격리: Dexie 캐시 비움
  const db = getDB();
  await db.embeddings.clear();
});

describe("embeddingQueue — privacy 필터(AC-3)", () => {
  test("globalOptOut=true면 네트워크 호출 0회", async () => {
    configureEmbeddingQueue({
      getGlobalOptOut: () => true,
      fetcher: successFetcher,
      onError: () => undefined,
    });
    enqueueEmbed("n1", "hello", false);
    enqueueEmbed("n2", "world", false);
    await flushNow();
    expect(successFetcher).not.toHaveBeenCalled();
  });

  test("aiOptOut=true 메모는 fetch 본문에 절대 포함되지 않음", async () => {
    configureEmbeddingQueue({
      getGlobalOptOut: () => false,
      fetcher: successFetcher,
      onError: () => undefined,
    });
    enqueueEmbed("ok", "OK content", false);
    enqueueEmbed("secret", "SECRET should never leak", true);
    await flushNow();
    expect(successFetcher).toHaveBeenCalledOnce();
    const body = JSON.parse(
      (successFetcher.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.texts).toContain("OK content");
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });
});

describe("embeddingQueue — 콘텐츠 해시 캐싱(AC-4)", () => {
  test("본문 변경 없으면 두 번째 호출은 fetch 0회", async () => {
    configureEmbeddingQueue({
      getGlobalOptOut: () => false,
      fetcher: successFetcher,
      onError: () => undefined,
    });
    enqueueEmbed("n1", "stable content", false);
    await flushNow();
    expect(successFetcher).toHaveBeenCalledOnce();

    successFetcher.mockClear();
    enqueueEmbed("n1", "stable content", false);
    await flushNow();
    expect(successFetcher).not.toHaveBeenCalled();
  });

  test("본문 바뀌면 다시 fetch", async () => {
    configureEmbeddingQueue({
      getGlobalOptOut: () => false,
      fetcher: successFetcher,
      onError: () => undefined,
    });
    enqueueEmbed("n1", "first", false);
    await flushNow();
    successFetcher.mockClear();

    enqueueEmbed("n1", "second", false);
    await flushNow();
    expect(successFetcher).toHaveBeenCalledOnce();
  });

  test("빈 본문은 호출 안 함", async () => {
    configureEmbeddingQueue({
      getGlobalOptOut: () => false,
      fetcher: successFetcher,
      onError: () => undefined,
    });
    enqueueEmbed("n1", "   ", false);
    await flushNow();
    expect(successFetcher).not.toHaveBeenCalled();
  });
});

describe("embeddingQueue — 배치 분할", () => {
  test("51개 들어오면 fetch 2회 (50 + 1)", async () => {
    configureEmbeddingQueue({
      getGlobalOptOut: () => false,
      fetcher: successFetcher,
      onError: () => undefined,
    });
    for (let i = 0; i < 51; i++) {
      enqueueEmbed(`n${i}`, `content-${i}`, false);
    }
    await flushNow();
    expect(successFetcher).toHaveBeenCalledTimes(2);
  });
});

describe("embeddingQueue — Dexie 영속", () => {
  test("성공 시 embeddings 테이블에 노트별 1행 저장", async () => {
    configureEmbeddingQueue({
      getGlobalOptOut: () => false,
      fetcher: successFetcher,
      onError: () => undefined,
    });
    enqueueEmbed("n1", "hello", false);
    enqueueEmbed("n2", "world", false);
    await flushNow();
    const all = await getDB().embeddings.toArray();
    const ids = all.map((e) => e.noteId).sort();
    expect(ids).toEqual(["n1", "n2"]);
    // fake-indexeddb는 Float32Array를 일반 배열로 reify할 수 있다.
    // 실제 브라우저 IDB는 보존되므로 length·값만 검증.
    expect(all[0].vector.length).toBe(1024);
    expect(all[0].vector[0]).toBeCloseTo(0.001, 5);
  });
});

describe("embeddingQueue — 실패 시 토스트", () => {
  test("5xx 응답이면 onError 호출, 캐시 미저장", async () => {
    const onError = vi.fn();
    configureEmbeddingQueue({
      getGlobalOptOut: () => false,
      fetcher: vi.fn(async () => new Response("upstream", { status: 502 })),
      onError,
    });
    enqueueEmbed("n1", "fail-case", false);
    await flushNow();
    expect(onError).toHaveBeenCalledOnce();
    const cached = await getDB().embeddings.get("n1");
    expect(cached).toBeUndefined();
  });
});
