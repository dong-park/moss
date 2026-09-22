/**
 * 임베딩 큐 (FEAT-ai-pipeline §6, §2 — 클라이언트 큐).
 *
 * 자동 백그라운드 임베딩은 매번 confirm 모달을 띄울 수 없으므로
 * useAIGate의 사용자 모달은 거치지 않는다. 대신 결정 함수 filterNotesForAI로
 * globalOptOut + aiOptOut을 차단(AC-3). 본 모듈만 ESLint의 fetch('/api/ai/...')
 * 화이트리스트에 들어간다.
 *
 * 흐름:
 *   enqueueEmbed(noteId, content, aiOptOut)
 *     → 5초 debounce
 *     → flush(): privacy 필터 + 콘텐츠 해시 비교 + 50개 배치 fetch + Dexie 캐싱
 *
 * 실패는 토스트로 알림 후 다음 호출 사이클에 다시 시도(다음 enqueue가 새 디바운스 시작).
 */

import { contentHash } from "./hash";
import { filterNotesForAI } from "../aiGate";
import { getDB } from "../db/schema";
// AI 오류 토스트와 함께 임시 숨김(2026-09-22).
// import { useToasts } from "../notifications";
import { useStorage } from "../storage";
// import { t } from "@/i18n";

const DEBOUNCE_MS = 5000;
const BATCH_SIZE = 50;

interface PendingEntry {
  content: string;
  aiOptOut: boolean;
}

interface QueueDeps {
  getGlobalOptOut: () => boolean;
  fetcher: typeof fetch;
  onError?: () => void;
}

const pending = new Map<string, PendingEntry>();
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

let deps: QueueDeps = {
  getGlobalOptOut: () =>
    useStorage.getState().settings?.aiOptOutGlobal ?? false,
  fetcher: typeof fetch === "function" ? fetch : (async () => {
    throw new Error("fetch unavailable");
  }) as typeof fetch,
  // 임시 숨김(2026-09-22 사용자 결정): "AI가 잠시 멈췄어요" 토스트. AI 키가 없으면
  // 메모를 칠 때마다 올라와 방해된다. 되돌리려면 주석을 푼다.
  onError: () => {
    // useToasts.getState().push({
    //   tone: "calm",
    //   title: t("ai.error.toast"),
    //   duration: 3000,
    // });
  },
};

export function configureEmbeddingQueue(next: Partial<QueueDeps>) {
  deps = { ...deps, ...next };
}

export function enqueueEmbed(
  noteId: string,
  content: string,
  aiOptOut: boolean,
) {
  pending.set(noteId, { content, aiOptOut });
  scheduleFlush();
}

function scheduleFlush() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, DEBOUNCE_MS);
}

export async function flushNow(): Promise<void> {
  if (inflight) return inflight;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // 자동 백그라운드 flush의 어떠한 reject도 unhandled로 새지 않도록 보수적으로
  // 모든 에러를 swallow. doFlush 내부에서 onError(토스트)는 이미 명시적으로 처리.
  inflight = doFlush()
    .catch((err) => {
      if (!isDatabaseClosed(err)) deps.onError?.();
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function doFlush(): Promise<void> {
  if (pending.size === 0) return;
  const snapshot = Array.from(pending.entries());
  pending.clear();

  const globalOut = deps.getGlobalOptOut();
  const refs = snapshot.map(([id, e]) => ({
    id,
    title: e.content.slice(0, 40),
    aiOptOut: e.aiOptOut,
  }));
  const { allowed } = filterNotesForAI(refs, globalOut);
  const allowedIds = new Set(allowed.map((a) => a.id));

  try {
    const db = getDB();
    const candidates: Array<{ id: string; content: string; hash: string }> =
      [];
    for (const [id, entry] of snapshot) {
      if (!allowedIds.has(id)) continue;
      if (entry.content.trim().length === 0) continue;
      const hash = await contentHash(entry.content);
      const cached = await db.embeddings.get(id);
      if (cached && cached.contentHash === hash) continue;
      candidates.push({ id, content: entry.content, hash });
    }

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const res = await deps.fetcher("/api/ai/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: batch.map((b) => b.content) }),
      });
      if (!res.ok) throw new Error(`embed ${res.status}`);
      const json = (await res.json()) as { vectors: number[][] };
      const now = Date.now();
      for (let k = 0; k < batch.length; k++) {
        await db.embeddings.put({
          noteId: batch[k].id,
          contentHash: batch[k].hash,
          vector: Float32Array.from(json.vectors[k]),
          updatedAt: now,
        });
      }
    }
  } catch (err) {
    // DB 닫힘(탭 종료/테스트 정리) 같은 비치명적 에러는 silent — 메모는 그대로.
    // 네트워크/upstream 실패는 사용자가 알 수 있게 토스트.
    if (isDatabaseClosed(err)) return;
    deps.onError?.();
  }
}

function isDatabaseClosed(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: string }).name;
  const innerName = (err as { inner?: { name?: string } }).inner?.name;
  if (name === "DatabaseClosedError" || innerName === "DatabaseClosedError") {
    return true;
  }
  return String((err as { message?: string }).message ?? err).includes(
    "Database has been closed",
  );
}

/** 테스트 전용 — 내부 상태 리셋. */
export function _resetEmbeddingQueue() {
  pending.clear();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  inflight = null;
}
