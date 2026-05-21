# FEAT-ai-pipeline · 임베딩 + 요약 + 연결 점수

> 메모를 벡터화하고, 군집·요약·연결 후보를 계산하는 백엔드 파이프라인. 모든 호출은 사용자 옵트인 + 프라이버시 게이트를 거친다.

**Status**: ◐ in-progress — embed·preview·summarize·connection-label endpoint + 연결 점수 + 클러스터링 완료. JWT/쿼터(FEAT-freemium 합류) 잔여.
**Estimated**: L
**Blueprint**: `features[id="FEAT-ai-pipeline"]`

---

## 0. 잔여 작업 (2026-05-21 검사 기준)

기존 산출물:
- ✓ `POST /api/ai/embed` — 1024d 벡터, OPENAI_API_KEY 미설정 시 결정론적 mock 반환
- ✓ `GET /api/preview` — 링크 OG 메타 (도메인 화이트리스트/SSRF 가드)
- ✓ `state/ai/embeddingQueue.ts` — 5초 debounce, 배치 50개, privacy 게이트 통과
- ✓ `state/ai/hash.ts` — 콘텐츠 해시 캐싱 (본문 동일 시 호출 0회)
- ✓ `state/ai/useAIPipeline.ts` — 클라이언트 hook
- ✓ tests: `embeddingQueue.test.ts`, `hash.test.ts`, `route.test.ts`

P0-1 (2026-05-21 완료):
- ✓ **`POST /api/ai/summarize`** — Claude Haiku 4.5 (`claude-haiku-4-5-20251001`), `ANTHROPIC_API_KEY` 없으면 결정적 mock
- ✓ **`POST /api/ai/connection-label`** — 동일 패턴, 1~3 단어 sanitize, MAX_TEXT_LEN 4000 가드
- ✓ **연결 점수 계산** — `state/ai/connectionScore.ts` (cosine × temporalDecay(30d half-life) × userSignal), 임계 0.78, 24h rejected 차단, 같은 보드/같은 클러스터 다양성 필터
- ✓ **클러스터링** — `state/ai/cluster.ts` single-pass O(N·K), 500개 가정
- ✓ `useAIPipeline` Slice 2: `summarizeBoard` / `findConnections` / `clusterRecent` (privacy 게이트 + fetch 단일 진입점 `state/ai/client.ts`)

잔여:
- ⏸ **쿼터 게이트** — `useQuotaGate()` stub 유지, [[FEAT-freemium]] 4차에서 교체
- ⏸ JWT 검증(모든 endpoint) — [[FEAT-freemium]] 합류 시 추가
- ⏸ 외부 API 1회 재시도(spec §8 — 현재는 즉시 fail)

공통 인터페이스 (다음 작업자에게):
```ts
// state/ai/useAIPipeline.ts에 추가
summarizeBoard(boardId: string, kind: "flow" | "cluster" | "rhythm"): Promise<string>
findConnections(noteId: string, topK?: number): Promise<ConnectionCandidate[]>
clusterRecent(days?: number): Promise<{ clusters: NoteCluster[]; summary: string }>
```

검증:
- [ ] msw 모킹으로 summarize / connection-label 단위 테스트
- [ ] privacy 게이트 통과 e2e (aiOptOut 메모 본문이 페이로드에 없음)
- [ ] 외부 API 5xx 시 graceful + 메모 기능 정상

---

## 1. 목표

moss의 AI는 "응집기·거울"이다. 글 대필이 아니라 사용자의 사고 패턴을 비춰주는 도구. 메모를 임베딩하고, 의미적으로 가까운 메모 쌍을 점수화하고, 자연어로 군집/흐름을 요약한다. [[FEAT-signals]]와 [[FEAT-home]]이 본 파이프라인의 결과를 사용자에게 노출한다.

## 2. 범위

### 포함
- **백엔드 프록시 endpoints** (Vercel Edge Functions, PRD §32):
  - `POST /api/ai/embed` — text → 1024d 벡터 (OpenAI text-embedding-3-small)
  - `POST /api/ai/summarize` — 텍스트 묶음 → 1-2 문장 요약 (Claude Haiku 4.5)
  - `POST /api/ai/connection-label` — 두 메모 → 1-3 단어 연결 라벨
- 클라이언트 임베딩 큐 시스템:
  - 메모 저장 시 5초 debounce 후 큐 등록
  - 배치 처리 (50개씩)
  - aiOptOut·전역 OptOut 필터링 ([[FEAT-privacy]] 게이트 통과)
  - 콘텐츠 해시 비교로 변경 안 된 메모는 skip
- 연결 점수 계산:
  - `score = cosineSimilarity × temporalDecay × userSignal`
  - 임계값 ≥ 0.78인 쌍을 후보로 (PRD §25-2)
  - 다양성 필터: 같은 보드 쌍 감점, 같은 클러스터 하루 1회만
- 임베딩 캐시 (Dexie `embeddings` 테이블)
- 군집화: HNSW 또는 단순 k-means (군집 결과는 [[FEAT-signals]] 노출)
- 사용자 학습 신호: rejected 연결은 임계값 개인화에 음의 신호

### 제외 (다른 FEAT 담당)
- 시그널스 패널 UI — [[FEAT-signals]]
- 시스템 보드 카드 큐레이팅 — [[FEAT-home]]
- AI 옵트아웃 토글 UI / 호출 직전 안내 — [[FEAT-privacy]]
- 쿼터 관리 / 결제 — [[FEAT-freemium]]
- OCR (이미지) / 음성 transcribe — 본 feature에서 분리. transcribe는 Whisper API 직접 호출, OCR은 Tesseract.js (로컬) 우선

## 3. 수용 기준

### AC-1 (REQ-5 충족) — AI 연결 제안 + 학습
- **Given** 메모 50개 임베딩 완료, 사용자가 연결 제안 N개를 본 상태
- **When** 사용자가 제안 중 일부를 거절
- **Then** 거절된 쌍의 score weight가 개인화 모델에 음의 신호로 반영. 동일 쌍은 24시간 동안 재추천 안 됨. status="rejected"로 저장.

### AC-2 (REQ-7 충족) — 자동 요약
- **Given** 보드에 메모 7일치 (예: 30개)
- **When** Signals 패널 열기
- **Then** "최근 7일 동안 N개의 생각을 남기셨어요. 그 중 X%가 연결되었습니다." 같은 자연어 요약 1-2문장 표시. Claude Haiku 호출 1회.

### AC-3 (REQ-10 충족) — 프라이버시 게이트
- **Given** `aiOptOut=true` 메모 또는 전역 옵트아웃
- **When** 임베딩 큐 처리
- **Then** 해당 메모는 큐에 진입하지 않음 (필터 단계). API 요청에 본문 자취 없음.

### AC-4 — 콘텐츠 해시 캐싱
- **Given** 메모 A가 이미 임베딩됨
- **When** 본문 변경 없이 다른 필드만 변경 (예: 위치 이동)
- **Then** 임베딩 재계산 안 함 (해시 일치).

### AC-5 — 쿼터 도달 시 graceful 처리
- **Given** Free 사용자 AI 쿼터 100회 소진
- **When** 추가 임베딩/요약 호출 시도
- **Then** 클라이언트 단에서 차단 + [[FEAT-freemium]] 트리거 (페이월 또는 잔잔한 토스트). 메모 저장 자체는 정상 동작.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-5, REQ-7, REQ-10
- 등장 화면: SCR-signals (4 섹션 결과 노출), SCR-workspace (시스템 보드 "오늘의 연결" 카드)
- 등장 flow: FLOW-ai-connection (전체), FLOW-capture-revisit (step 3 — 저장 후 임베딩 큐 등록)

### 다른 feature
- **의존**: [[FEAT-storage]] (`embeddings` 테이블, `Note` 읽기), [[FEAT-privacy]] (`useAIGate()`), [[FEAT-freemium]] (쿼터 체크)
- **의존받음**: [[FEAT-signals]] (군집/요약/리듬), [[FEAT-home]] (재노출 카드 후보)

### 외부 라이브러리·API
- `@anthropic-ai/sdk` (Claude Haiku 4.5)
- `openai` (임베딩 only)
- 벡터 검색: HNSW (`hnswlib-node` 또는 클라이언트는 `usearch-wasm`) — 우선 단순 코사인 N×N (메모 500개까지)

## 5. 데이터 모델

[[FEAT-storage]]의 `EmbeddingCacheEntry`. 추가 클라이언트 상태:

```ts
interface PendingEmbedJob {
  noteId: string;
  contentHash: string;
  scheduledAt: number;     // debounce timer
}

interface ConnectionCandidate {
  sourceId: string;
  targetId: string;
  score: number;           // 0~1
  components: { cosine: number; temporal: number; userSignal: number };
  computedAt: number;
}

interface PersonalizationModel {
  // 단순 weight 조정 — 사용자가 거절한 쌍의 임베딩 거리에 음의 보정
  rejectedPairs: Array<{ a: string; b: string; rejectedAt: number }>;
  thresholdAdjustment: number;  // 개인화된 임계 (0.78 ± δ)
}
```

## 6. 인터페이스

### 클라이언트 API
- `useAIPipeline()`:
  - `enqueueEmbed(noteId: string): void` — 5초 debounce, aiGate 통과
  - `getEmbedding(noteId): Float32Array | null` — 캐시 조회
  - `findConnections(noteId, topK=10): Promise<ConnectionCandidate[]>`
  - `summarizeBoard(boardId): Promise<string>`
  - `clusterRecent(days=7): Promise<{ clusters: NoteCluster[]; summary: string }>`

### 백엔드 endpoints
```
POST /api/ai/embed
  body: { texts: string[] } (배치, 최대 50)
  headers: Authorization (사용자 토큰)
  res: { vectors: number[][]; tokensUsed: number }
  rate limit: per user (FEAT-freemium 쿼터)

POST /api/ai/summarize
  body: { texts: string[]; kind: "flow" | "cluster" | "rhythm" }
  res: { text: string; tokensUsed: number }

POST /api/ai/connection-label
  body: { textA: string; textB: string }
  res: { label: string; tokensUsed: number }
```

모든 endpoint:
- Supabase Auth JWT 검증
- 쿼터 체크 (DB 호출 1회)
- 본문 로그 금지
- 응답 영구 저장 금지 (pass-through)
- 외부 API 실패 시 5xx + 클라이언트는 graceful degradation

## 7. 시각·인터랙션

본 feature는 백엔드/계산 레이어. UI 노출은 [[FEAT-signals]], [[FEAT-home]], [[FEAT-privacy]]가 담당.

호출 진행 표시:
- 클라이언트 임베딩 큐가 N개 대기 중일 때, 상태바에 잔잔한 인디케이터 (옵션, MVP 보류)
- 호출 실패 시 토스트 안내: "AI가 잠시 멈췄어요. 메모는 그대로 있어요." — [[FEAT-i18n]] 키

## 8. 비기능 요구사항

- **성능**:
  - 임베딩 배치 50개: 응답 시간 < 3s
  - 군집 + 요약 호출 (메모 100개 기준): < 5s
  - 클라이언트 cosine N×N: 메모 500개에서 < 200ms (Web Worker로 분리 권장)
- **프라이버시**: 모든 호출이 [[FEAT-privacy]] `useAIGate()` 통과. 백엔드 로그에 본문 0건.
- **비용**: 임베딩 캐싱 + 콘텐츠 해시 비교로 재계산 최소화. Free 사용자 평균 호출 횟수 측정 후 쿼터 조정.
- **장애 복원**: 외부 API 5xx 시 재시도 1회 후 graceful fail. 메모 저장 자체엔 영향 없음.

## 9. 다음 iteration

- **OCR** (이미지 → 텍스트) — Tesseract.js 로컬 우선, Pro에서 Claude Sonnet vision
- **음성 transcribe** — Whisper API 분리 endpoint
- **HNSW 인덱싱** — 메모 500+ 시점에 도입
- **사용자 패턴 그래프** — 시간대별 사고 유형 (PRD §13 사고 리듬)
- **다중 모델 ensemble** — Claude + GPT 결과 비교 (Phase 3)
- **연결 라벨 자동 생성 학습** — 사용자 수정한 라벨로 fine-tune

## 10. 검증 방법 (DOD)

- [ ] 임베딩 배치 단위 테스트 (msw 모킹)
- [ ] 콘텐츠 해시 캐싱 (본문 안 바뀌면 호출 0회)
- [ ] [[FEAT-privacy]] 게이트 e2e: aiOptOut 메모는 네트워크 요청에 절대 안 포함
- [ ] 쿼터 도달 시 graceful (페이월·메모 저장 정상)
- [ ] 외부 API 5xx 시뮬레이션 → 메모 기능 정상, 토스트 표시
- [ ] PRD §24-25 (AI Pipeline, Connection Algorithm) 정합성 확인
