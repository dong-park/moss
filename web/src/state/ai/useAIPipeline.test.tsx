import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAIPipeline } from "./useAIPipeline";
import { configureAIClient } from "./client";
import { useStorage } from "../storage";
import { getDB, resetDB, type Note, type EmbeddingCacheEntry } from "../db/schema";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function note(overrides: Partial<Note> & { id: string; content: string }): Note {
  return {
    boardId: null,
    kind: "text",
    x: 0,
    y: 0,
    width: 240,
    rotation: 0,
    aiOptOut: false,
    createdAt: NOW,
    updatedAt: NOW,
    lastVisitedAt: NOW,
    ...overrides,
  };
}

function embedding(noteId: string, vector: number[]): EmbeddingCacheEntry {
  return {
    noteId,
    contentHash: `h-${noteId}`,
    vector: Float32Array.from(vector),
    updatedAt: NOW,
  };
}

let lastSummarizeBody: { texts: string[]; kind: string } | null = null;
const summarizeFetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
  lastSummarizeBody = JSON.parse((init?.body as string) ?? "{}");
  return new Response(
    JSON.stringify({ text: "mocked summary", tokensUsed: 0, mocked: true }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

beforeEach(async () => {
  await resetDB();
  await useStorage.getState().init();
  lastSummarizeBody = null;
  summarizeFetcher.mockClear();
  configureAIClient({ fetcher: summarizeFetcher });
});

afterEach(async () => {
  await resetDB();
  useStorage.setState({ initialized: false, settings: null, quota: null });
});

describe("useAIPipeline.summarizeBoard", () => {
  test("globalOptOut=true → 호출 없이 빈 문자열", async () => {
    await useStorage.getState().updateSettings({ aiOptOutGlobal: true });
    const { result } = renderHook(() => useAIPipeline());
    const text = await result.current.summarizeBoard("B1", "flow");
    expect(text).toBe("");
    expect(summarizeFetcher).not.toHaveBeenCalled();
  });

  test("aiOptOut=true 메모 본문은 페이로드에 포함되지 않음", async () => {
    await getDB().notes.bulkPut([
      note({ id: "ok", boardId: "B1", content: "OK 메모" }),
      note({ id: "secret", boardId: "B1", content: "SECRET 메모", aiOptOut: true }),
    ]);
    const { result } = renderHook(() => useAIPipeline());
    await result.current.summarizeBoard("B1", "flow");
    expect(summarizeFetcher).toHaveBeenCalledOnce();
    expect(lastSummarizeBody?.texts).toContain("OK 메모");
    expect(JSON.stringify(lastSummarizeBody)).not.toContain("SECRET");
    expect(lastSummarizeBody?.kind).toBe("flow");
  });

  test("모든 메모 차단되면 호출 없이 빈 문자열", async () => {
    await getDB().notes.bulkPut([
      note({ id: "s1", boardId: "B1", content: "x", aiOptOut: true }),
    ]);
    const { result } = renderHook(() => useAIPipeline());
    const text = await result.current.summarizeBoard("B1", "flow");
    expect(text).toBe("");
    expect(summarizeFetcher).not.toHaveBeenCalled();
  });
});

describe("useAIPipeline.findConnections", () => {
  test("globalOptOut → 빈 배열", async () => {
    await useStorage.getState().updateSettings({ aiOptOutGlobal: true });
    const { result } = renderHook(() => useAIPipeline());
    expect(await result.current.findConnections("n1")).toEqual([]);
  });

  test("임베딩 있는 유사 메모를 source가 포함된 후보로 반환", async () => {
    await getDB().notes.bulkPut([
      note({ id: "n1", content: "본 메모" }),
      note({ id: "n2", content: "닮은 메모" }),
      note({ id: "n3", content: "다른 메모" }),
    ]);
    await getDB().embeddings.bulkPut([
      embedding("n1", [1, 0]),
      embedding("n2", [0.99, 0.14]), // cosine ~= 0.99
      embedding("n3", [0, 1]), // 직교
    ]);
    const { result } = renderHook(() => useAIPipeline());
    const r = await result.current.findConnections("n1");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((c) => c.sourceId === "n1" || c.targetId === "n1")).toBe(true);
    const targetIds = r.map((c) => (c.sourceId === "n1" ? c.targetId : c.sourceId));
    expect(targetIds).toContain("n2");
    expect(targetIds).not.toContain("n3");
  });

  test("source 메모가 aiOptOut이면 빈 배열", async () => {
    await getDB().notes.bulkPut([
      note({ id: "n1", content: "secret", aiOptOut: true }),
      note({ id: "n2", content: "ok" }),
    ]);
    await getDB().embeddings.bulkPut([
      embedding("n1", [1, 0]),
      embedding("n2", [1, 0]),
    ]);
    const { result } = renderHook(() => useAIPipeline());
    expect(await result.current.findConnections("n1")).toEqual([]);
  });
});

describe("useAIPipeline.clusterRecent", () => {
  test("globalOptOut → 빈 결과", async () => {
    await useStorage.getState().updateSettings({ aiOptOutGlobal: true });
    const { result } = renderHook(() => useAIPipeline());
    const r = await result.current.clusterRecent();
    expect(r.clusters).toEqual([]);
    expect(r.summary).toBe("");
    expect(summarizeFetcher).not.toHaveBeenCalled();
  });

  test("최근 메모를 클러스터링하고 summarize 호출", async () => {
    const recent = Date.now() - DAY;
    await getDB().notes.bulkPut([
      note({ id: "a", content: "독서 메모", createdAt: recent }),
      note({ id: "b", content: "독서 메모2", createdAt: recent }),
      note({ id: "c", content: "산책 메모", createdAt: recent }),
    ]);
    await getDB().embeddings.bulkPut([
      embedding("a", [1, 0]),
      embedding("b", [0.99, 0.14]),
      embedding("c", [0, 1]),
    ]);
    const { result } = renderHook(() => useAIPipeline());
    const r = await result.current.clusterRecent(7);
    expect(r.clusters.length).toBeGreaterThanOrEqual(2);
    expect(r.summary).toBe("mocked summary");
    expect(lastSummarizeBody?.kind).toBe("cluster");
  });

  test("최근 메모 0개 → 빈 결과, 호출 없음", async () => {
    const { result } = renderHook(() => useAIPipeline());
    const r = await result.current.clusterRecent(7);
    expect(r.clusters).toEqual([]);
    expect(r.summary).toBe("");
    expect(summarizeFetcher).not.toHaveBeenCalled();
  });
});
