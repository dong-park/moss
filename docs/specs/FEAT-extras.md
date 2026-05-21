# FEAT-extras · 시스템 보드 부가 위젯 카드

> "오늘의 질문 / 생각 일기 / 연결 히스토리" — 시스템 보드 안에 항상 있는 작은 위젯 카드 3종.

**Status**: spec
**Estimated**: S
**Blueprint**: `features[id="FEAT-extras"]`

---

## 1. 목표

시스템 보드의 큐레이팅 카드(AI 자동)는 [[FEAT-home]]이 담당. 본 feature는 사용자 의도·시간·연결 행동의 가벼운 트리거가 되는 **고정 위젯 카드 3종**을 시스템 보드 안에 추가한다. 일반 카드와 시각 구분, 삭제 불가.

## 2. 범위

### 포함
- 위젯 카드 3종 (PRD §7-1):
  1. **오늘의 질문** — 사용자가 메타 질문 직접 입력 (예: "내가 진짜 풀고 싶은 문제는?"). 단일 입력칸.
  2. **생각 일기** — 캘린더 + 날짜별 메모 dot. 클릭 시 해당 날짜 메모 필터링.
  3. **연결 히스토리** — 연결 생성 순서 타임라인. 최근 5-10개 연결 표시.
- 위젯 카드 시각 구분 (PRD §7-1):
  - 일반 카드와 다른 배경 (예: 살짝 lime tint)
  - 헤더 배지 또는 작은 아이콘
  - 삭제 불가 (Delete 키 무시)
- 위치: 시스템 보드 내 고정 영역 (좌표는 [[FEAT-home]]이 결정, 또는 시스템 보드 진입 시 자동 배치)

### 제외 (다른 FEAT 담당)
- 큐레이팅 카드 4종 — [[FEAT-home]]
- 캔버스 자체 — [[FEAT-canvas]]
- 메모 영속 — [[FEAT-storage]]
- AI 응집 분석 — [[FEAT-ai-pipeline]]

## 3. 수용 기준

### AC-1 (REQ-13 충족) — 3종 모두 표시
- **Given** 시스템 보드 진입
- **When** 캔버스 렌더링
- **Then** 위젯 카드 3종 모두 자동 배치 (시스템 보드 좌표에 고정). 일반 카드와 시각 구분.

### AC-2 — 오늘의 질문 입력
- **Given** "오늘의 질문" 위젯
- **When** 사용자가 질문 입력 후 blur
- **Then** Note (특수 kind="meta-question") 저장. 날짜별 1개씩.

### AC-3 — 생각 일기 dot
- **Given** 최근 30일간 메모 분포
- **When** "생각 일기" 위젯 렌더링
- **Then** 캘린더 30일 표시, 메모 있는 날에 작은 dot. dot 클릭 → 그 날짜 메모만 필터링 보기.

### AC-4 — 연결 히스토리
- **Given** 최근 7일간 연결 생성 5개
- **When** "연결 히스토리" 위젯
- **Then** 생성 순서대로 타임라인 (예: `5/18 → 5/22 → 5/24`). 각 항목 클릭 → 연결된 두 메모 강조.

### AC-5 — 삭제 불가
- **Given** 위젯 카드 선택
- **When** Delete 키
- **Then** 삭제 안 됨. 잔잔한 시각 피드백 (살짝 흔들림 또는 toast 안내 — 강하지 않게)

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-13
- 등장 화면: SCR-workspace `system` variant (시스템 보드 안)
- 등장 flow: 직접 등장 없음 (FEAT-home이 호스트)

### 다른 feature
- **의존**: [[FEAT-home]] (시스템 보드 컨텍스트), [[FEAT-storage]] (메타 질문 저장, 메모 날짜 query, 연결 query), [[FEAT-canvas]] (캔버스 좌표)
- **의존받음**: 없음

## 5. 데이터 모델

```ts
// 메타 질문 — Note 안에 특수 kind로 저장
type ExtendedNoteKind = NoteKind | "meta-question";

// 또는 별도 테이블
interface MetaQuestion {
  id: string;
  date: string;          // "2026-05-21" — 날짜별 unique
  question: string;
  createdAt: number;
}
```

생각 일기·연결 히스토리는 별도 영속 없이 query로:
- 생각 일기: `notes` 테이블에서 createdAt 기준 일자별 count
- 연결 히스토리: `connections` 테이블에서 createdAt 기준 최근 N개

## 6. 인터페이스

### React 컴포넌트
- `<TodayQuestionWidget />` — 오늘의 질문 위젯
- `<ThoughtDiaryWidget />` — 생각 일기 캘린더
- `<ConnectionHistoryWidget />` — 연결 히스토리 타임라인
- `<SystemWidgetCard variant="meta-question" | "diary" | "history" />` — 공통 wrapper (lime tint, 배지)

### Store actions
- `useWorkspace.setTodayQuestion(text: string): void` — upsert by date
- `useWorkspace.getTodayQuestion(): string | null`
- `useWorkspace.queryNotesByDate(date: string): Note[]`
- `useWorkspace.queryRecentConnections(limit=10): Connection[]`

## 7. 시각·인터랙션

- PRD 참조: §7-1 위젯 카드, §11 SCR-workspace `system` variant (캔버스 카드 배치 예시)
- 위젯 카드 톤: 일반 카드보다 살짝 다른 배경 (lime tint `var(--color-card-lime)`)
- 캘린더 dot: muted lime, 메모 많은 날은 살짝 진하게 (max 3단계)
- 연결 히스토리: 작은 노드 + 화살표, 손글씨 톤 (옵션, 폰트 Caveat 활용)

## 8. 비기능 요구사항

- **성능**: query 단순 (날짜·count·orderBy) — Dexie 인덱스로 < 50ms
- **접근성**: 캘린더는 키보드 화살표로 일자 이동
- **i18n**: "오늘의 질문", "생각 일기", "연결 히스토리" 모두 i18n 키

## 9. 다음 iteration

- **메타 질문 히스토리** — 지난 질문 모음 (현재는 오늘 1개만)
- **감정 트래커 위젯** — 일기에 감정 태그
- **연결 히스토리 시각 강화** — 노드 그래프, 줌 가능
- **사용자 정의 위젯** — 사용자가 위젯 종류 선택 (Phase 2)

## 10. 검증 방법 (DOD)

- [ ] 3종 위젯 모두 시스템 보드 진입 시 자동 표시
- [ ] 메타 질문 날짜별 저장·복원
- [ ] 캘린더 dot 정확도 (날짜별 메모 count 일치)
- [ ] 연결 히스토리 최근 순 정렬
- [ ] Delete 키 시 삭제 안 됨
- [ ] PRD §11 `system` variant 와이어프레임 시각 대조 (3개 위젯 위치)
