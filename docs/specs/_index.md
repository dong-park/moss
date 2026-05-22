# moss 기능 스펙 인덱스

> 블루프린트 `features[]` 14개 + Phase 2 카드 UX 신규 2개 = 16개. 완료본은 `complete/`로 이동, 잔여·미시작은 본 디렉토리에 유지.

## 진척 현황 (2026-05-22)

| 상태 | 수 | 위치 |
|---|---|---|
| ✅ complete | 6 | `complete/` |
| ◐ in-progress | 4 | 본 디렉토리, §0 잔여 작업 명시 |
| ⏸ pending | 4 | 본 디렉토리, 그대로 |
| 📋 spec-only (Phase 2) | 2 | 본 디렉토리, 구현 대기 |

## ✅ Complete (검증 통과)

storage · i18n · privacy · capture · boards · templates — 모두 `complete/` 디렉토리. 다시 건드릴 일 없음.

---

# 🎯 작업 분배 (병렬 우선순위)

병렬 가능한 단위를 의존성·블로커 기준으로 P0/P1/P2 그룹화. **6명이 동시에 시작 가능**, ai-pipeline 보강(P0)이 끝나면 C 그룹 3명 추가 풀림.

## 그래프

```
[P0 critical] FEAT-ai-pipeline 보강
                    │
                    ▼  (해제 후 C 그룹 풀림)
[C-1] home 큐레이팅 3종
[C-2] signals Cluster + FlowSummary

[P1 즉시 병렬, 독립]
[P1-A] canvas 가상화
[P1-B] freemium 전체
[P1-C] export 전체
[P1-D] mobile 전체
[P1-E] extras 위젯 3종

[P2 작은 fix, 누구나]
[P2-A] signals lint 3건 (5분)
```

## P0 — Critical path (블로커, 1명 단독 우선)

| ID | 작업자 | 작업 | 잔여 | 의존 |
|---|---|---|---|---|
| **P0-1** | ai-pipeline | [`FEAT-ai-pipeline.md`](FEAT-ai-pipeline.md) §0 | `/api/ai/summarize` + `/api/ai/connection-label` endpoint, 연결 점수 (cos × temporal × user) 헬퍼, 클러스터링 (k-means or 코사인 N×N) | 없음 |

P0가 끝나야 C-1 (home today-connection·resurfacing)과 C-2 (signals Cluster·FlowSummary)가 풀린다. **가장 빨리 시작해야 할 단일 작업**.

## P1 — 즉시 병렬 (서로 독립, P0와 동시 시작)

| ID | 작업자 | 작업 | 핵심 잔여 | 추정 |
|---|---|---|---|---|
| **P1-A** | canvas | [`FEAT-canvas.md`](FEAT-canvas.md) §0 | AC-3 가상화 — viewport intersection 컬링(추천) 또는 react-window | M |
| **P1-B** | freemium | [`FEAT-freemium.md`](FEAT-freemium.md) | Stripe checkout + webhook + 쿼터 추적 + 페이월 3 variant 모달 + `useQuotaGate()` 실 구현 (현재 stub 교체) | M |
| **P1-C** | export | [`FEAT-export.md`](FEAT-export.md) | Markdown / JSON Canvas / .moss 번들 3종 + 모달 + 진행/완료 variant + Import | M |
| **P1-D** | mobile | [`FEAT-mobile.md`](FEAT-mobile.md) | viewport ≤ 768px 분기 + 모바일 피드 + 하단 캡처 바 + 3 variant | M |
| **P1-E** | extras | [`FEAT-extras.md`](FEAT-extras.md) | 오늘의 질문 / 생각 일기 / 연결 히스토리 위젯 3종 (home 시스템 보드 안 위치만 빌림, 데이터는 자체 query) | S |

5명 동시 시작 가능. 서로 의존 없음. 각자 `docs/specs/FEAT-*.md` + 본인 §0/§1~10 만 보면 됨.

## P2 — Small fix (누구나, 5분~30분)

| ID | 작업 | 위치 | 추정 |
|---|---|---|---|
| **P2-A** | signals lint 3건 fix | `state/signals/useSignals.ts:29` (effect 안 setState), `useSignals.test.tsx:27,161` (lastState mutate) | 5분 |
| **P2-B** | act 환경 1줄 추가 | `vitest.setup.ts`에 `globalThis.IS_REACT_ACT_ENVIRONMENT = true` | 1분 |
| **P2-C** | `DatabaseClosedError` cleanup | `useClipboardWatch.test.tsx` 비동기 후처리 정리 | 10분 |
| **P2-D** | i18n 빌드 검증 스크립트 | `scripts/check-i18n.mjs`를 prebuild에 연결 | 15분 |

빠른 정리. P0/P1과 병행 가능.

## C — P0 완료 후 풀림 (3명 추가 병렬)

P0-1이 끝나면 다음 3개가 동시 가능:

| ID | 작업자 | 작업 | 잔여 |
|---|---|---|---|
| **C-1** | home | [`FEAT-home.md`](FEAT-home.md) §0 | 큐레이팅 3종 카드: `resurfacing` (임베딩 cluster 안 시간 거리), `today-connection` (P0-1의 `findConnections` + `connection-label`), `flow-timeline` (자체 SVG) + 도구 drop 무소속·삭제 가드·dismiss 24h |
| **C-2** | signals | [`FEAT-signals.md`](FEAT-signals.md) §0 | ClusterSection (P0-1의 클러스터링), FlowSummarySection (P0-1의 `/api/ai/summarize`), 키워드 → 캔버스 `filterByKeyword(word)` action, dismiss 24h |
| (병행) | canvas (P1-A 작업자) | `filterByKeyword` action 추가 + 강조·dim 처리 | C-2와 협조 |

---

## 우선순위 요약 (한 줄)

| 우선순위 | 시작 시점 | 작업 수 | 비고 |
|---|---|---|---|
| **P0** | 지금 | 1 | critical path — 가장 빨리 시작 |
| **P1** | 지금 (P0와 동시) | 5 | 서로 독립, 완전 병렬 |
| **P2** | 누구나·아무 때 | 4 | 작은 fix, 사이드 작업 |
| **C** | P0 완료 후 | 2 (+1 협조) | 의존 풀림 |

**최대 동시 작업자 수**:
- 초기 6명 (P0 1 + P1 5)
- 작은 fix 별도 (P2)
- P0 후 → 7명 (canvas 작업자가 C에 협조 또는 다른 P1 마무리)

---

# 기존 스펙 위치 참조

## ◐ In-progress (잔여 작업 명시됨, §0 참조)

| FEAT | 파일 |
|---|---|
| canvas | [FEAT-canvas.md](FEAT-canvas.md) |
| ai-pipeline | [FEAT-ai-pipeline.md](FEAT-ai-pipeline.md) |
| home | [FEAT-home.md](FEAT-home.md) |
| signals | [FEAT-signals.md](FEAT-signals.md) |

## ⏸ Pending (그대로)

| FEAT | 파일 |
|---|---|
| extras | [FEAT-extras.md](FEAT-extras.md) |
| freemium | [FEAT-freemium.md](FEAT-freemium.md) |
| mobile | [FEAT-mobile.md](FEAT-mobile.md) |
| export | [FEAT-export.md](FEAT-export.md) |

## 📋 Phase 2 카드 UX (spec 작성 완료, 구현 대기)

[`SIDEBAR-CARDS-UX.md`](complete/SIDEBAR-CARDS-UX.md) 9종 카드 UX 강화의 §7 D-3 Phase 2 항목을 spec으로 정리. 두 spec은 서로 독립 P1으로 동시 진행 가능하나, `entry-mode`가 먼저 머지되면 `card-flow`의 Cmd+Enter / Cmd+E UX가 매끄러워짐(없어도 동작은 함).

| FEAT | 파일 | 핵심 |
|---|---|---|
| card-entry-mode | [FEAT-card-entry-mode.md](FEAT-card-entry-mode.md) | 카드 생성 직후 종류별 기본 포커스 자동 박힘. `useAutoFocusOnEdit` 헬퍼 + 10종 selector 표 |
| card-flow | [FEAT-card-flow.md](FEAT-card-flow.md) | Cmd+Enter(다음 카드) · Tab/Shift+Tab(선택 이동) · Cmd+E(편집 진입) · Esc. 신규 hook `useCardFlowShortcuts` + store 액션 3개 |

DAG: `[entry-mode] (P1 독립)` + `[card-flow] (P1 독립, entry-mode 효과에 soft-기댐)`. 둘 다 추정 M.

## 스펙 작성·갱신 규칙

- complete 이동 시: `**Status**: ✅ complete (날짜) — 검증 통과, AC 모두 충족`
- in-progress 진입: 본문 §1 위에 `## 0. 잔여 작업` 섹션 (압축된 todo list)
- 본 인덱스는 phase 종료마다 재갱신
