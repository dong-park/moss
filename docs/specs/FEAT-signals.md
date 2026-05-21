# FEAT-signals · AI 응집기 / 사고 거울

> 우측에서 미끄러져 나오는 패널. 키워드·군집·요약·리듬 4개 섹션. AI가 사용자 사고를 비춰주는 거울.

**Status**: ◐ in-progress — 2/4 섹션 + 빈/옵트아웃 variant 완료. lint 3건, Cluster·FlowSummary 섹션, dismiss·키워드 필터 동작 잔여.
**Estimated**: M
**Blueprint**: `features[id="FEAT-signals"]`

---

## 0. 잔여 작업 (2026-05-21 검사 기준)

기존 산출물:
- ✓ `SignalsPanel.tsx` — Radix Dialog 슬라이드인
- ✓ `KeywordsSection.tsx` (반복 키워드 top N)
- ✓ `RhythmSection.tsx` (시간대별 spark chart)
- ✓ `state/signals/{extractKeywords,buildRhythm,stopwords,useSignals,types}.ts`
- ✓ status state: `'opt-out' | 'empty' | 'ready'` (data-empty + 옵트아웃 잠금)
- ✓ tests: extractKeywords·buildRhythm·useSignals

남은 작업 — lint fix (우선):
- ✗ **`useSignals.ts:29` lint error** — `useEffect` 안에서 `setNotes(null)` 직접 호출. 조건문을 effect 밖으로 빼거나 별도 effect로 분리.
- ✗ **`useSignals.test.tsx:27,161` lint error** — `lastState` 외부 변수 mutate. `useRef` 또는 `act()+waitFor` 패턴으로.

남은 작업 — 누락 섹션 2종:
- ✗ **`ClusterSection`** — force-directed 미니 그래프 (노드=메모, 클러스터별 컬러)
  - 데이터원: [[FEAT-ai-pipeline]] `clusterRecent()` (잔여) 또는 클라이언트 k-means
  - 라이브러리: `d3-force` 또는 단순 SVG
- ✗ **`FlowSummarySection`** — 자연어 1-2문장 요약
  - 데이터원: [[FEAT-ai-pipeline]] `/api/ai/summarize` (잔여)
  - 본 feature 작업자가 ai-pipeline endpoint와 같이 신설 — 3차 brief 합의대로

남은 작업 — AC 검증·동작:
- ✗ **AC-2 (키워드 → 캔버스 필터)** — KeywordsSection 클릭 → `filterByKeyword(word)` action → 캔버스에서 해당 메모 강조 + 다른 메모 dim
- ✗ **AC-5 (dismiss 24h)** — `dismissInsight(key)` 액션, settings에 dismissedAt 기록, 다음 진입 시 해당 섹션 hide
- ✗ **AC-4 (quota-exhausted variant)** — freemium stub 유지, 임시 토글로 시연만

types.ts 갱신 필요:
```ts
| { status: "ready"; total: number;
    keywords: KeywordItem[];
    clusters: ClusterItem[];     // 추가
    flowSummary: string;         // 추가
    rhythm: number[];
  }
```

검증:
- [ ] `npm run lint` 0 errors
- [ ] 4 섹션 모두 표시 (default variant 시각 대조 PRD §13)
- [ ] 키워드 클릭 → 캔버스 필터링 e2e
- [ ] dismiss 후 새로고침해도 24h 동안 hide

---

## 1. 목표

moss의 AI는 글을 생성하는 도구가 아니라 **사용자 자신을 비춰주는 거울**. Signals 패널은 사용자가 명시적으로 열어서 "내 사고가 어떻게 보이지?"를 확인하는 공간. 자동 push 알림 없음, 사용자가 원할 때만.

## 2. 범위

### 포함
- Signals 패널 (Radix Dialog 또는 자체 slide-in)
- 4개 섹션 (PRD §13):
  1. **반복 키워드** — top 5-10, 빈도 표시, 클릭 시 워크스페이스에서 해당 메모 필터링
  2. **사고 군집** — force-directed 미니 그래프, 노드=메모, 클러스터별 컬러
  3. **흐름 요약** — 자연어 1-2문장 (Claude Haiku 출력)
  4. **사고 리듬** — 시간대별 메모 빈도 spark chart + 패턴 설명
- 3개 variant 대응 (SCR-signals):
  - `default`: 정상 (4 섹션)
  - `data-empty`: 메모 < 10, "조금 더 머무르면 패턴이 보일 거예요"
  - `quota-exhausted`: AI 쿼터 소진, 마지막 캐시 + Pro 전환 안내 (잔잔)
- 진입점:
  - 좌측 사이드바 시그널스 아이콘
  - 단축키 `g s` (g 누른 후 s)
  - 시스템 보드 "오늘의 연결" 카드의 "더 보기"
- 인사이트 [×] (개별 닫기) → `dismissedAt` 기록, 같은 인사이트 24h 동안 재노출 안 함

### 제외 (다른 FEAT 담당)
- AI 호출 자체 (임베딩/요약) — [[FEAT-ai-pipeline]]
- 옵트아웃 게이트 — [[FEAT-privacy]]
- 쿼터 관리 — [[FEAT-freemium]]
- 시스템 보드 카드 큐레이팅 — [[FEAT-home]]

## 3. 수용 기준

### AC-1 (REQ-7 충족) — 4개 섹션 작동
- **Given** 메모 50개, AI 쿼터 잔여 있음
- **When** 사이드바 시그널스 클릭 또는 `g s`
- **Then** 패널이 200ms 이내 우측에서 미끄러져 등장. 키워드 top 5+, 군집 그래프, 자연어 요약 1-2문장, 시간대별 차트 모두 표시. AI 호출은 캐시 우선, 없으면 백엔드 호출.

### AC-2 (REQ-5 충족) — 키워드 → 메모 필터링
- **Given** 키워드 "신뢰" 표시 (빈도 23)
- **When** 사용자가 "신뢰" 클릭
- **Then** 패널 닫히고 워크스페이스 캔버스가 "신뢰" 포함 메모만 강조 표시. 다른 메모는 dim. 검색 해제 버튼 노출.

### AC-3 — `data-empty` variant
- **Given** 메모 < 10
- **When** Signals 진입
- **Then** 4 섹션 대신 안내 카드 1개 "조금 더 머무르면 패턴이 보일 거예요". AI 호출 0건.

### AC-4 — `quota-exhausted` variant
- **Given** Free 사용자 쿼터 소진 + 캐시된 마지막 결과 존재
- **When** Signals 진입
- **Then** 캐시된 결과 + 하단에 잔잔한 카드 "이번 달 인사이트는 여기까지" + Pro 전환 버튼. 어떤 새 AI 호출도 안 함.

### AC-5 — 개별 인사이트 dismiss
- **Given** "흐름 요약" 카드의 [×] 클릭
- **When** 사용자가 닫음
- **Then** 같은 인사이트 24시간 재노출 안 함 (settings에 dismissedAt 기록). 다음 진입 시 다른 섹션은 보임.

### AC-6 — 옵트아웃 잠금
- **Given** `aiOptOutGlobal=true`
- **When** Signals 진입
- **Then** 패널 자체가 잠금 상태. "시그널스를 켜면 패턴이 보입니다" + 토글 안내.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-5, REQ-7
- 등장 화면: SCR-signals 3 variant 모두
- 등장 flow: FLOW-ai-connection (step 2-3)

### 다른 feature
- **의존**: [[FEAT-ai-pipeline]] (요약·군집·키워드 계산), [[FEAT-privacy]] (옵트아웃 게이트), [[FEAT-freemium]] (쿼터 체크), [[FEAT-storage]] (인사이트 캐시·dismissed)
- **의존받음**: [[FEAT-home]] ("오늘의 연결" 카드의 "더 보기"가 Signals로)

### 외부 라이브러리
- `@radix-ui/react-dialog` (이미 설치됨) — 슬라이드인 패널
- 군집 그래프 시각: `d3-force` 또는 단순 SVG

## 5. 데이터 모델

```ts
// 인사이트 캐시
interface SignalsCache {
  computedAt: number;
  ttl: number;             // 6시간 default
  keywords: Array<{ word: string; count: number }>;
  clusters: Array<{ id: string; theme: string; noteIds: string[]; centroid: number[] }>;
  flowSummary: string;     // 자연어 요약
  rhythm: { hourBuckets: number[]; pattern: string };  // 시간대별 빈도 + 1줄 설명
}

interface DismissedInsight {
  key: string;             // "keywords" | "cluster:abc" | "flow-summary" | "rhythm"
  dismissedAt: number;
}
```

## 6. 인터페이스

### React 컴포넌트
- `<SignalsPanel open onClose />` — 메인 슬라이드인
- `<KeywordsSection />` / `<ClusterGraph />` / `<FlowSummaryCard />` / `<RhythmChart />`
- `<SignalsEmpty />` / `<SignalsQuotaExhausted />` — 빈/쿼터 variant
- `<SignalsLocked />` — 옵트아웃 시

### Store actions
- `useWorkspace.openSignals(): Promise<void>` — 패널 열기 + 캐시 확인 + 필요 시 [[FEAT-ai-pipeline]] 호출
- `useWorkspace.filterByKeyword(word: string): void` — 캔버스 필터 모드 진입
- `useWorkspace.dismissInsight(key: string): void`

### Hooks
- `useSignalsShortcut()` — `g s` 시퀀스 단축키
- `useSignalsData(): SignalsCache | null` — 캐시 + loading 상태

## 7. 시각·인터랙션

- PRD 참조: §7-4, §13 SCR-signals 3 variant
- 패널 폭: 420px 데스크톱, 모바일은 전체 화면
- 슬라이드인 모션: 200ms cubic-bezier(0.16, 1, 0.3, 1) (PRD §8-4)
- 톤: "이 연결이 흥미로우신가요?" 같은 명시 동의 형태 (PRD §7-4)
- 자동 push 알림 절대 금지

## 8. 비기능 요구사항

- **성능**: 캐시 hit 시 패널 열기 < 200ms. miss 시 백엔드 호출 후 < 3s.
- **AI 비용**: 캐시 TTL 6시간 — 자주 열어도 비용 폭증 안 함
- **접근성**: 키보드 도달 (Esc 닫기, Tab 섹션 순회). 색약: 키워드 빈도는 숫자도 함께 표시.

## 9. 다음 iteration

- **시계열 비교** — "지난주 vs 이번주 키워드 변화" (Phase 2)
- **개인화된 인사이트** — 사용자 관심 토픽 학습
- **공유 가능 인사이트** — 패널 결과 캡처 → 이미지 공유 (Phase 3)
- **음성 요약** — TTS로 흐름 요약 읽어주기 (Phase 3)

## 10. 검증 방법 (DOD)

- [ ] 3개 variant (default / data-empty / quota-exhausted) 모두 시각 대조
- [ ] 키워드 클릭 → 캔버스 필터링 정확
- [ ] dismiss 24h 재노출 안 함
- [ ] 옵트아웃 시 잠금 상태
- [ ] AI 호출이 [[FEAT-privacy]] 게이트 통과
- [ ] PRD §13 와이어프레임 시각 대조
