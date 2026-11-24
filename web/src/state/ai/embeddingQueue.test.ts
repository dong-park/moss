import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  configureEmbeddingQueue,
  enqueueEmbed,
  flushNow,
  _resetEmbeddingQueue,
} from "./embeddingQueue";
import { getDB } from "../db/schema";
import { useAuth } from "@/state/auth/store";

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

describe("embeddingQueue — 로그인 토큰", () => {
  test("임베딩 요청이 갱신된 access 토큰을 보낸다", async () => {
    const original = useAuth.getState().ensureSession;
    useAuth.setState({ ensureSession: vi.fn(async () => ({ accessToken: "fresh-embed" }) as never) });
    configureEmbeddingQueue({
      getGlobalOptOut: () => false,
      fetcher: successFetcher,
      onError: () => undefined,
    });
    enqueueEmbed("tok", "token check", false);
    await flushNow();
    useAuth.setState({ ensureSession: original });
    const init = successFetcher.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fresh-embed");
  });
});

describe("embeddingQueue — 429 보존과 재시도", () => {
  function limitedFetcher(okCalls: number) {
    let n = 0;
    return vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      n += 1;
      if (n > okCalls) return new Response("{}", { status: 429 });
      const body = JSON.parse((init?.body as string) ?? "{}") as { texts: string[] };
      return new Response(
        JSON.stringify({ vectors: body.texts.map(() => new Array(4).fill(0.1)), tokensUsed: 0, mocked: true }),
        { status: 200 },
      );
    });
  }
  function setup(fetcher: typeof fetch) {
    configureEmbeddingQueue({ getGlobalOptOut: () => false, fetcher, onError: () => undefined });
  }

  test("429를 받은 배치는 보존되고 61초 뒤 다음 호출에서 저장된다", async () => {
    const fetcher = limitedFetcher(20);
    setup(fetcher as unknown as typeof fetch);
    for (let i = 0; i < 1001; i++) enqueueEmbed(`bulk-${i}`, `content-${i}`, false);
    await flushNow();
    expect(fetcher).toHaveBeenCalledTimes(21);
    expect(await getDB().embeddings.get("bulk-1000")).toBeUndefined();
    // 대기 중에는 같은 호출을 반복하지 않는다.
    await flushNow();
    expect(fetcher).toHaveBeenCalledTimes(21);

    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      fetcher.mockImplementation(async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}") as { texts: string[] };
        return new Response(JSON.stringify({ vectors: body.texts.map(() => [0.1]), tokensUsed: 0, mocked: true }), { status: 200 });
      });
      enqueueEmbed("next-cycle", "next content", false);
      await flushNow();
    } finally {
      Date.now = realNow;
    }
    expect(await getDB().embeddings.get("bulk-1000")).toBeDefined();
    expect(await getDB().embeddings.get("next-cycle")).toBeDefined();
  });

  test("보존된 옛 내용이 같은 메모의 새 내용을 덮지 않는다", async () => {
    const fetcher = limitedFetcher(0);
    setup(fetcher as unknown as typeof fetch);
    enqueueEmbed("n", "old text", false);
    await flushNow();
    enqueueEmbed("n", "new text", false);
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    const sent: string[] = [];
    try {
      fetcher.mockImplementation(async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}") as { texts: string[] };
        sent.push(...body.texts);
        return new Response(JSON.stringify({ vectors: body.texts.map(() => [0.1]), tokensUsed: 0, mocked: true }), { status: 200 });
      });
      await flushNow();
    } finally {
      Date.now = realNow;
    }
    expect(sent).toEqual(["new text"]);
  });

  test("계속 429면 재시도는 3번까지만 하고 포기한다", async () => {
    const fetcher = limitedFetcher(0);
    setup(fetcher as unknown as typeof fetch);
    enqueueEmbed("n", "text", false);
    await flushNow();
    const realNow = Date.now;
    let offset = 0;
    Date.now = () => realNow() + offset;
    try {
      for (let i = 1; i <= 6; i++) {
        offset = i * 61_000;
        await flushNow();
      }
    } finally {
      Date.now = realNow;
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe("embeddingQueue — 보존된 메모와 개인정보", () => {
  async function holdOne(fetcher: ReturnType<typeof vi.fn>) {
    configureEmbeddingQueue({ getGlobalOptOut: () => false, fetcher: fetcher as unknown as typeof fetch, onError: () => undefined });
    enqueueEmbed("n", "secret old", false);
    await flushNow();
  }
  const rateLimited = () => vi.fn(async () => new Response("{}", { status: 429 }));
  async function laterFlushSends(fetcher: ReturnType<typeof vi.fn>) {
    const sent: string[] = [];
    fetcher.mockImplementation(async (_u: unknown, init?: RequestInit) => {
      const t = (JSON.parse((init?.body as string) ?? "{}") as { texts: string[] }).texts;
      sent.push(...t);
      return new Response(JSON.stringify({ vectors: t.map(() => [0.1]), tokensUsed: 0, mocked: true }), { status: 200 });
    });
    const realNow = Date.now;
    Date.now = () => realNow() + 61_000;
    try {
      await flushNow();
    } finally {
      Date.now = realNow;
    }
    return sent;
  }

  test("같은 id를 aiOptOut으로 다시 enqueue하면 옛 내용은 보내지 않는다", async () => {
    const f = rateLimited();
    await holdOne(f);
    enqueueEmbed("n", "secret new", true);
    await flushNow();
    const sent = await laterFlushSends(f);
    expect(sent).toEqual([]);
    expect(await getDB().embeddings.get("n")).toBeUndefined();
  });

  test("같은 id를 빈 내용으로 다시 enqueue하면 옛 내용은 보내지 않는다", async () => {
    const f = rateLimited();
    await holdOne(f);
    enqueueEmbed("n", "   ", false);
    await flushNow();
    expect(await laterFlushSends(f)).toEqual([]);
  });

  test("전역 제외 상태의 flush가 보존된 메모를 취소해 해제 뒤에도 보내지 않는다", async () => {
    const f = rateLimited();
    await holdOne(f);
    let globalOut = true;
    configureEmbeddingQueue({ getGlobalOptOut: () => globalOut });
    await flushNow();
    globalOut = false;
    expect(await laterFlushSends(f)).toEqual([]);
  });
});
