# FEAT-home · 시스템 보드 "머무는 생각"

> 첫 진입 기본 보드. 사용자 메모를 직접 저장하지 않고, AI가 큐레이팅한 카드들이 자동으로 모이는 곳.

**Status**: ◐ in-progress — 큐레이팅 카드 1/4 + 빈 상태 + 보드 fix 완료. 나머지 3종 큐레이팅 카드 + AC 검증 잔여.
**Estimated**: M
**Blueprint**: `features[id="FEAT-home"]`

---

## 0. 잔여 작업 (2026-05-21 검사 기준)

기존 산출물:
- ✓ `SystemBoard.tsx` — 시스템 보드 컨테이너
- ✓ `state/selectors/systemBoard.ts` — `computeNowStayingCards()` (지금 머무는 ×n)
- ✓ `cards/SystemBoardEmpty.tsx` — 메모 < 10 빈 상태 안내
- ✓ `currentBoardId === SYSTEM_BOARD_ID` 기본값 (첫 진입 시스템 보드)
- ✓ `state/__tests__/ac-home.test.ts`
- ✓ HTML 검증: "조금 더 머무르면…" 빈 상태 카피 노출

남은 작업 — 큐레이팅 카드 3종 추가:
- ✗ **`resurfacing` (다시 떠오른 생각)** — N일 전 메모 + 최근 메모의 연결 후보
  - 데이터원: 같은 임베딩 cluster 안에서 시간 거리가 큰 페어
  - selector: `computeResurfacingCards(cards, embeddings, days?)`
  - card: `cards/ResurfacingCard.tsx`
- ✗ **`today-connection` (오늘의 연결)** — AI 추천 연결 후보 (수락/거절)
  - 데이터원: [[FEAT-ai-pipeline]]의 `findConnections()` (잔여)
  - 라벨: [[FEAT-ai-pipeline]]의 `/api/ai/connection-label` (잔여)
  - card: `cards/TodayConnectionCard.tsx` (수락→Connection 생성, 거절→`status=rejected`)
- ✗ **`flow-timeline` (사고 흐름 타임라인)** — 최근 사고 이동 흐름 시각화
  - 데이터원: 최근 N개 메모 createdAt + 연결 그래프
  - card: `cards/FlowTimelineCard.tsx` (간단 노드+엣지 SVG)

남은 작업 — AC 검증·동작 점검:
- ✗ **AC-3 (도구 drop 안내)** — 시스템 보드에 도구 drop 시 무소속(`boardId=null`) + "새 보드를 만들까요?" 토스트
- ✗ **AC-5 (삭제 가드)** — 큐레이팅 카드 Delete 키 무시 + 잔잔한 피드백
- ✗ **dismiss 24h** — `dismissCuratedItem(id)` 액션, settings에 dismissedAt 기록

의존: [[FEAT-ai-pipeline]] 잔여 (summarize·connection-label·findConnections·clusterRecent) — **본 feature와 함께 마무리 필요**

검증:
- [ ] 메모 30개 + 시간 분포 시드 → 큐레이팅 카드 4종 모두 표시
- [ ] dismiss 후 24h 재노출 안 함
- [ ] 시스템 보드 도구 drop → 무소속 + 토스트 + 새 보드 권유

---

## 1. 목표

PRD §38-2 Decision 11: 별도 홈 화면 없이 시스템 보드 1개로 "재노출 가치"를 보존. 사용자가 메모를 직접 두지 않고, AI가 행동·시간·연결을 기반으로 큐레이팅한 카드들이 자동 생성된다. 메모 < 10이면 잔잔한 안내, 그 이상이면 큐레이팅 카드들이 나타남.

## 2. 범위

### 포함
- 시스템 보드 `boards` 테이블의 `isSystem=true` 단일 행 (자동 생성, 삭제 불가)
- 보드 picker 첫 항목 고정
- 큐레이팅 카드 4종 (PRD §7-1):
  1. **지금 머무는 생각** (×n) — 최근 자주 회귀한 주제 (lastVisitedAt 기반)
  2. **다시 떠오른 생각** — N일 전 메모와 최근 메모의 연결 resurfacing
  3. **오늘의 연결** — AI 추천 연결 후보 (수락/거절)
  4. **사고 흐름 타임라인** — 최근 사고 이동 흐름 시각화
- 위젯 카드 3종은 별도 — [[FEAT-extras]]가 담당
- 빈 상태 (메모 < 10): 큐레이팅 카드 대신 "조금 더 머무르면 패턴이 보일 거예요" 안내 (SCR-workspace `system-empty` variant)
- 사용자 도구 드롭 시 안내: "새 보드를 만들까요?" 토스트 (PRD §7-1) — 시스템 보드는 사용자 메모 직접 저장 안 함
- 큐레이팅 재계산 주기: 사용자 진입 시 + 1시간마다 백그라운드 (옵션)

### 제외 (다른 FEAT 담당)
- 위젯 카드 (오늘의 질문 / 생각 일기 / 연결 히스토리) — [[FEAT-extras]]
- AI 연결 점수 계산 — [[FEAT-ai-pipeline]]
- 캔버스 자체 — [[FEAT-canvas]]
- 보드 picker / 시스템 보드 첫 항목 고정 — [[FEAT-boards]]
- 모바일 머무는 생각 피드 — [[FEAT-mobile]]

## 3. 수용 기준

### AC-1 (REQ-6 충족) — 재노출 기반 자동 큐레이팅
- **Given** 메모 30개, 그 중 일부가 7일 전, 일부가 어제
- **When** 시스템 보드 진입
- **Then** 큐레이팅 카드 4종 모두 표시. "지금 머무는 생각"엔 최근 lastVisitedAt 갱신된 메모 주제 3-5개. "다시 떠오른 생각"엔 5일+ 전 + 최근 연결 후보 표시.

### AC-2 — 빈 상태
- **Given** 메모 < 10
- **When** 시스템 보드 진입
- **Then** 큐레이팅 카드들 대신 안내 카드 1개 "조금 더 머무르면 패턴이 보일 거예요. 도구를 끌어다 놓아보세요."

### AC-3 — 도구 드롭 시 안내
- **Given** 시스템 보드 머물러 있음
- **When** 사용자가 사이드바 도구 드래그 → 시스템 보드 캔버스 drop
- **Then** 카드는 생성되지만 무소속(`boardId=null`)으로 저장. 잔잔한 토스트 "이 메모는 무소속이에요. 새 보드에 두시겠어요?" + "새 보드" 버튼.

### AC-4 — 첫 진입 = 시스템 보드
- **Given** 신규 사용자가 [[FEAT-capture]] 첫 캡처 완료
- **When** 워크스페이스로 이동
- **Then** 시스템 보드가 자동 선택됨. 첫 메모는 무소속 상태.

### AC-5 — 큐레이팅 카드는 삭제·이동 불가
- **Given** 시스템 보드의 "오늘의 연결" 카드
- **When** 사용자가 Delete 키 시도
- **Then** 삭제 안 됨 (카드 자체는 가상 — 큐레이팅 결과 wrapper). "수락"/"숨기기"로 개별 항목만 처리.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-6
- 등장 화면: SCR-workspace `system` / `system-empty` variant
- 등장 flow: FLOW-capture-revisit (전체), FLOW-ai-connection (step 4-6 — 오늘의 연결 카드)

### 다른 feature
- **의존**: [[FEAT-canvas]] (캔버스), [[FEAT-storage]] (메모·lastVisitedAt), [[FEAT-ai-pipeline]] (연결 후보·요약), [[FEAT-boards]] (시스템 보드 fix)
- **의존받음**: [[FEAT-extras]] (위젯 카드는 시스템 보드 안에 추가)

### 외부 라이브러리
- 없음 (계산 + 렌더링만)

## 5. 데이터 모델

큐레이팅 카드는 동적 — DB에 영속 안 함 (재계산). 캐시는 in-memory:

```ts
interface SystemBoardCards {
  computedAt: number;
  cards: Array<
    | { kind: "now-staying"; theme: string; noteIds: string[]; visitCount: number }
    | { kind: "resurfacing"; oldNoteId: string; recentNoteId: string; daysGap: number }
    | { kind: "today-connection"; candidateId: string }  // ConnectionCandidate 참조
    | { kind: "flow-timeline"; nodes: Array<{ noteId: string; at: number }>; edges: Array<{ from: string; to: string }> }
  >;
}
```

## 6. 인터페이스

### Store actions
- `useWorkspace.computeSystemBoard(): Promise<SystemBoardCards>` — 진입 시 + 1시간 주기
- `useWorkspace.dismissCuratedItem(id: string): void` — 24h 동안 재노출 안 함
- `useWorkspace.acceptConnection(candidateId): void` — Connection(status=active) 생성

### React 컴포넌트
- `<SystemBoard />` — 시스템 보드 캔버스 콘텐츠 wrapper
- `<NowStayingCard ... />` / `<ResurfacingCard ... />` / `<TodayConnectionCard ... />` / `<FlowTimelineCard ... />`
- `<SystemBoardEmpty />` — 메모 < 10일 때 안내

## 7. 시각·인터랙션

- PRD 참조: §7-1, §11 SCR-workspace `system` / `system-empty` variant
- 큐레이팅 카드 톤: 일반 카드와 시각 구분 (PRD §7-1) — 살짝 다른 배경 (lime tint?) 또는 헤더 배지
- "오늘의 연결" 수락 모션: 카드가 가운데로 모이는 잔향 200ms (PRD §8-4)

## 8. 비기능 요구사항

- **성능**: 시스템 보드 진입 → 큐레이팅 카드 렌더링 < 500ms (계산은 캐시 활용)
- **AI 호출 빈도**: 1시간에 1회 + 사용자 수동 새로고침. 과도한 호출 방지.
- **재노출 학습**: 사용자가 "숨기기"한 항목은 학습 신호로 [[FEAT-ai-pipeline]]에 전달

## 9. 다음 iteration

- **개인화 큐레이팅 모델** — 사용자 행동 패턴 기반 (현재는 휴리스틱)
- **시스템 보드 커스터마이즈** — 사용자가 위젯 카드 on/off (Phase 2)
- **시간대별 큐레이팅** — 오전엔 구조화 메모, 밤엔 감정 메모 (PRD §13 사고 리듬)

## 10. 검증 방법 (DOD)

- [ ] 메모 < 10 → 빈 상태 안내 1개
- [ ] 메모 30개 + 다양한 시점 → 큐레이팅 카드 4종 모두 표시
- [ ] 도구 drop → 무소속 + 새 보드 권유 토스트
- [ ] 큐레이팅 카드 dismiss → 24h 재노출 안 함
- [ ] PRD §11 `system` / `system-empty` variant 시각 대조
