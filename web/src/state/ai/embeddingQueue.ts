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

import { aiAuthHeaders } from "./authHeaders";
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

/** 429로 못 보낸 메모. 대기 시각 전에는 보내지 않는다. 같은 id의 새 내용이 pending에 있으면 그쪽이 이긴다. */
const held = new Map<string, PendingEntry>();
let heldUntil = 0;
let rateRetries = 0;
const RATE_LIMIT_WAIT_MS = 61_000;
const MAX_RATE_RETRIES = 3;

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
  // 같은 메모의 새 호출은 보존된 옛 내용을 무효로 한다. 제외 표시나 빈 내용도 포함한다.
  held.delete(noteId);
  pending.set(noteId, { content, aiOptOut });
  scheduleFlush();
}

function scheduleFlush(delay: number = DEBOUNCE_MS) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushNow();
  }, delay);
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
      // 대기 중인 메모가 있는데 타이머가 디바운스에 덮였으면 대기 시각으로 다시 잡는다.
      if (held.size > 0 && !timer) scheduleFlush(Math.max(heldUntil - Date.now(), 0));
    });
  return inflight;
}

async function doFlush(): Promise<void> {
  // 전역 제외 중에는 보존된 메모도 취소한다. 해제된 뒤에 옛 내용을 보내지 않는다.
  if (deps.getGlobalOptOut()) held.clear();
  const holdOver = held.size > 0 && Date.now() < heldUntil;
  if (!holdOver && held.size > 0) {
    for (const [id, entry] of held) if (!pending.has(id)) pending.set(id, entry);
    held.clear();
  }
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
        headers: await aiAuthHeaders(),
        body: JSON.stringify({ texts: batch.map((b) => b.content) }),
      });
      if (res.status === 429) {
        holdUnsent(candidates.slice(i), snapshot);
        return;
      }
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
    rateRetries = 0;
  } catch (err) {
    // DB 닫힘(탭 종료/테스트 정리) 같은 비치명적 에러는 silent — 메모는 그대로.
    // 네트워크/upstream 실패는 사용자가 알 수 있게 토스트.
    if (isDatabaseClosed(err)) return;
    deps.onError?.();
  }
}

/** 보내지 못한 메모를 보존하고 61초 뒤로 재시도를 잡는다. 3번 넘게 막히면 포기한다. */
function holdUnsent(
  unsent: Array<{ id: string; content: string }>,
  snapshot: Array<[string, PendingEntry]>,
): void {
  rateRetries += 1;
  if (rateRetries > MAX_RATE_RETRIES) {
    rateRetries = 0;
    held.clear();
    deps.onError?.();
    return;
  }
  const byId = new Map(snapshot);
  for (const u of unsent) {
    const entry = byId.get(u.id);
    // 그사이 같은 메모의 새 내용이 들어왔으면 옛 내용은 버린다.
    if (entry && !pending.has(u.id)) held.set(u.id, entry);
  }
  heldUntil = Date.now() + RATE_LIMIT_WAIT_MS;
  scheduleFlush(RATE_LIMIT_WAIT_MS);
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
  held.clear();
  heldUntil = 0;
  rateRetries = 0;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  inflight = null;
}
