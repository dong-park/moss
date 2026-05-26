/**
 * AI 연결 후보 점수 계산 (FEAT-ai-pipeline §0, §6, PRD §25-2).
 *
 *   score = cosineSimilarity × temporalDecay × userSignal
 *
 * - cosineSimilarity: 두 임베딩 벡터의 코사인 (정규화된 벡터를 가정)
 * - temporalDecay: 두 메모의 생성 시각 간 거리에 따른 0.5~1.0 감쇠
 *                  (같은 날 1.0, 30일 이상 떨어지면 약 0.5)
 * - userSignal: 사용자 학습 신호 (1.0 기본, 거절된 쌍·같은 보드는 감점)
 *
 * 임계값 ≥ 0.78인 쌍을 후보로 채택 (PRD §25-2).
 * 24시간 이내 거절 이력이 있는 쌍은 후보에서 제거.
 * 같은 보드 쌍은 0.85 감점, 같은 클러스터는 하루 1회만 노출(상위 1개 선택).
 *
 * 순수 함수 — Dexie/React 의존성 없음. 단위 테스트 용이.
 */

export interface ScoredNote {
  id: string;
  boardId: string | null;
  createdAt: number;
  vector: Float32Array | number[];
  clusterId?: string;
}

export interface RejectedPair {
  a: string;
  b: string;
  rejectedAt: number;
}

export interface ConnectionCandidate {
  sourceId: string;
  targetId: string;
  score: number;
  components: { cosine: number; temporal: number; userSignal: number };
  computedAt: number;
}

export interface ScoreOptions {
  /** 후보 임계 (기본 0.78, PRD §25-2). */
  threshold?: number;
  /** 거절된 쌍 (24시간 이내면 후보 제거 + 영구적으로 0.85 감점). */
  rejectedPairs?: RejectedPair[];
  /** 같은 클러스터 하루 1회 제한 기준 시각 (기본: now). */
  now?: number;
}

const DEFAULT_THRESHOLD = 0.78;
const REJECT_WINDOW_MS = 24 * 60 * 60 * 1000;
const TEMPORAL_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30일 → 0.5
const SAME_BOARD_PENALTY = 0.85;
const REJECTED_PENALTY = 0.85;

export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[],
): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * 두 메모의 시간 거리(ms)를 0.5~1.0의 감쇠로 매핑.
 * 같은 시각 → 1.0, 30일 차 → 0.5, 그 이후 점근 0.5.
 */
export function temporalDecay(createdAtA: number, createdAtB: number): number {
  const dt = Math.abs(createdAtA - createdAtB);
  const decay = 0.5 + 0.5 * Math.exp(-dt / TEMPORAL_HALF_LIFE_MS);
  return Math.max(0.5, Math.min(1, decay));
}

/**
 * 사용자 학습 신호 — 같은 보드 쌍(이미 묶음을 본 곳)과 과거 거절 이력은 감점.
 * 신규 쌍은 1.0.
 */
export function userSignal(
  a: ScoredNote,
  b: ScoredNote,
  rejectedPairs: RejectedPair[],
): number {
  let signal = 1;
  if (a.boardId && b.boardId && a.boardId === b.boardId) {
    signal *= SAME_BOARD_PENALTY;
  }
  if (hasRejectedPair(a.id, b.id, rejectedPairs)) {
    signal *= REJECTED_PENALTY;
  }
  return signal;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function hasRejectedPair(
  a: string,
  b: string,
  rejected: RejectedPair[],
): boolean {
  const key = pairKey(a, b);
  return rejected.some((r) => pairKey(r.a, r.b) === key);
}

function isRecentRejection(
  a: string,
  b: string,
  rejected: RejectedPair[],
  now: number,
): boolean {
  const key = pairKey(a, b);
  return rejected.some(
    (r) => pairKey(r.a, r.b) === key && now - r.rejectedAt < REJECT_WINDOW_MS,
  );
}

/**
 * 메모 N개에서 임계값 이상의 연결 후보를 추출.
 *
 * 다양성 필터:
 * - 같은 클러스터 쌍은 점수 상위 1개만 통과
 * - 24h 이내 거절된 쌍은 후보 제거
 * - 거절 이력 + 같은 보드는 점수 감점 (userSignal에서 반영)
 *
 * 결과는 score 내림차순 정렬.
 */
export function computeConnectionCandidates(
  notes: ScoredNote[],
  options: ScoreOptions = {},
): ConnectionCandidate[] {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const rejected = options.rejectedPairs ?? [];
  const now = options.now ?? Date.now();

  const all: ConnectionCandidate[] = [];
  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const a = notes[i];
      const b = notes[j];
      if (isRecentRejection(a.id, b.id, rejected, now)) continue;

      const cosine = cosineSimilarity(a.vector, b.vector);
      const temporal = temporalDecay(a.createdAt, b.createdAt);
      const signal = userSignal(a, b, rejected);
      const score = cosine * temporal * signal;
      if (score < threshold) continue;

      all.push({
        sourceId: a.id,
        targetId: b.id,
        score,
        components: { cosine, temporal, userSignal: signal },
        computedAt: now,
      });
    }
  }

  all.sort((x, y) => y.score - x.score);

  // 같은 클러스터 쌍은 상위 1개만 (하루 1회 제한)
  const seenClusterPair = new Set<string>();
  const filtered: ConnectionCandidate[] = [];
  const byId = new Map(notes.map((n) => [n.id, n]));
  for (const c of all) {
    const a = byId.get(c.sourceId);
    const b = byId.get(c.targetId);
    const clusterA = a?.clusterId;
    const clusterB = b?.clusterId;
    if (clusterA && clusterB) {
      const key =
        clusterA < clusterB
          ? `${clusterA}|${clusterB}`
          : `${clusterB}|${clusterA}`;
      if (seenClusterPair.has(key)) continue;
      seenClusterPair.add(key);
    }
    filtered.push(c);
  }
  return filtered;
}
