# FEAT-canvas · 거대 캔버스 + 줌 기반 UX

> 카드가 자유롭게 떠 있는 무한 작업대. 확대로 세부, 축소로 사고 지형도. 메모 200+에서도 성능 유지.

**Status**: ◐ in-progress — AC 5/6 충족, AC-3(200+ 메모 가상화)만 잔여
**Estimated**: L
**Blueprint**: `features[id="FEAT-canvas"]`

---

## 0. 잔여 작업 (2026-05-21 검사 기준)

기존 산출물:
- ✓ 카드 자유 배치·드래그·미세 회전·z-index — 동작
- ✓ 다중 선택 (marquee 박스, Shift/Cmd additive) — `Canvas.tsx`
- ✓ 줌·팬 (휠 / Space+drag / 미들 마우스 / 트랙패드 핀치) + `ZoomBar`
- ✓ 카드 더블클릭 편집·Delete 삭제·Escape 해제
- ✓ 우상단 Unsorted 카운터

남은 작업:
- ✗ **AC-3 (REQ-16) 가상화** — 메모 200+ 시점에 viewport 컬링·자동 모드 전환. 현재 `react-window` 미설치, DOM 직접 렌더만.
  - 옵션 A: `react-window` 도입 (간단, 다만 자유 배치 grid에 부적합)
  - 옵션 B: 자체 viewport intersection 컬링 (카드 bbox vs viewport rect)
  - 옵션 C: Canvas2D fallback (PRD §26-1) — 가장 큰 작업, Phase 2 권장
  - **추천**: 옵션 B 우선 (LOC 적음, 자유 배치와 호환). Canvas2D는 메모 1,000+ 시점에 재검토.
- 200 임계 토스트 + 자동 fallback 전환 안내 (PRD §11 States 항목)

검증:
- [ ] 메모 200개 시드 + 줌·팬 60fps 유지 (Chrome DevTools Performance)
- [ ] viewport 밖 카드는 DOM에 없음

---

## 1. 목표

moss의 메인 메타포는 "정리되지 않은 사고가 모이는 살아있는 벽". 카드들이 자유 좌표로 배치되고, 사용자가 줌으로 가까이 들어가 메모를 읽거나 멀어져 패턴을 보는 행위가 본질이다.

## 2. 범위

### 포함
- 카드 자유 배치 (절대 좌표 world space)
- 카드 드래그 이동 (마우스 + 터치)
- 카드 선택 (단일 클릭) / 다중 선택 (Cmd+클릭 / 드래그 박스)
- 카드 더블 클릭 → 인플레이스 편집 모드 (실제 편집은 [[FEAT-capture]])
- 카드 삭제 (Delete / Backspace, 선택 후)
- 캔버스 팬 (Space+drag, 미들 마우스, 트랙패드 두 손가락)
- 캔버스 줌 (마우스 휠 / 핀치, 마우스 앵커. 우하단 줌바 +/-/100%/원점 복귀)
- 줌 범위 25%~300% (PRD §7-2)
- DOM 렌더링 + 가상화 (`react-window` 기반 viewport 컬링)
- 200+ 메모 도달 시 자동 Canvas2D fallback 전환 (PRD §26-1)
- 카드 미세 회전 ±1.5° (종이 질감)
- 카드별 z-index (선택된 카드 위로)
- 캔버스 dot grid 배경 (24px 간격)
- 우상단 "N Unsorted" 카운터

### 제외 (다른 FEAT 담당)
- 카드 본체 콘텐츠·편집 UI — [[FEAT-capture]]
- 카드 영속 — [[FEAT-storage]]
- 보드 전환 (캔버스는 한 번에 하나의 보드만 표시) — [[FEAT-boards]]
- 연결선 그리기 — 본 feature 범위 내이지만 MVP 보류, 별도 sub-spec
- 시스템 보드 자동 큐레이팅 — [[FEAT-home]]

## 3. 수용 기준

### AC-1 (REQ-4 충족) — 자유 배치 + 줌
- **Given** 캔버스에 카드 5장 배치
- **When** 사용자가 마우스 휠로 50% 줌아웃
- **Then** 모든 카드가 같은 상대 위치 유지하며 화면에서 50% 크기로 표시. 마우스 커서 아래 world 점은 줌 전후 같은 위치.

### AC-2 (REQ-4 보강) — 팬
- **Given** 캔버스 임의 상태
- **When** Space+drag 또는 미들 마우스 drag
- **Then** 캔버스가 마우스 따라 이동. 카드 위에서도 작동 (capture phase 가로채기).

### AC-3 (REQ-16 충족) — 200+ 메모 성능
- **Given** 메모 200개를 가진 보드
- **When** 캔버스 로드 + 줌·팬·드래그
- **Then** 60fps 유지 (jank <16.7ms). viewport 밖 카드는 DOM에 마운트 안 함 (가상화). 200 임계 도달 시 토스트 안내 "더 부드러운 렌더러로 전환합니다" → Canvas2D 활성.

### AC-4 — 카드 드래그
- **Given** 카드를 마우스로 잡음
- **When** 3px 이상 이동
- **Then** 드래그 모드 시작 (cursor=grabbing). 줌 상태에서도 마우스 정확히 따라옴 (delta / scale 보정).

### AC-5 — 다중 선택
- **Given** 캔버스에 카드 여러 장
- **When** 빈 영역에서 마우스 드래그로 박스 선택 또는 Cmd+클릭
- **Then** 다중 선택 상태. 다중 드래그·삭제 가능.

### AC-6 — 우상단 카운터
- **Given** 현재 보드의 메모 수 N
- **When** 캔버스 표시
- **Then** 우상단에 "N Unsorted" 또는 단위 표시. 시스템 보드일 때는 다른 카피 (i18n 키)

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-4, REQ-16
- 등장 화면: SCR-workspace 6 variant 모두 (캔버스가 메인 영역)
- 등장 flow: FLOW-board-build (전체), FLOW-onboarding (step 4)

### 다른 feature
- **의존**: [[FEAT-storage]] (Note 로드/저장), [[FEAT-capture]] (편집 모드 위임)
- **의존받음**: [[FEAT-home]], [[FEAT-boards]], [[FEAT-extras]]

### 외부 라이브러리
- `react-window` (가상화)
- 향후 (Phase 2): `pixi.js` 또는 자체 Canvas2D 렌더러

## 5. 데이터 모델

```ts
// src/state/viewport.ts (FEAT-canvas 전용)
export interface Viewport {
  x: number;       // pan offset (screen px)
  y: number;
  scale: number;   // 0.25 ~ 3
}

// MIN_SCALE = 0.25, MAX_SCALE = 3 상수 export
```

Note 위치(`x`, `y`)는 world 좌표, [[FEAT-storage]]의 `Note` 스키마에 이미 정의.

## 6. 인터페이스

### Store actions (이미 구현됨, MVP)
- `moveCard(id, x, y)`
- `select(id)` / `selectMultiple(ids)`
- `setEditing(id)`
- `remove(id)` / `removeMultiple(ids)`
- `panBy(dx, dy)` / `zoomAt(factor, screenX, screenY)` / `setScale(s)` / `resetViewport()`

### React 컴포넌트
- `<Canvas />` — 본 feature의 메인 컴포넌트
- `<DraggableCard card={note} />` — 카드 wrapper (드래그·선택)
- `<CardSelectionBox start={p} end={p} />` — 드래그 박스 다중 선택 시각
- `<ZoomBar />` — 우하단 줌 컨트롤
- `<UnsortedBadge count={n} />` — 우상단 카운터

### Hooks
- `useViewport()` — viewport 상태
- `useCanvasShortcuts()` — Delete/Backspace, Escape, Cmd+A 등

## 7. 시각·인터랙션

- PRD 참조: §7-2, §11 SCR-workspace 와이어프레임 6 variant
- dot grid: `radial-gradient(var(--color-dot) 1px, transparent 1px)`, 24px 간격 (PRD §11)
- 카드 미세 회전 ±1.5° (PRD §8-4)
- 연결선 (수동 실선, AI 점선) — 본 feature 안에 들어가지만 MVP 보류

## 8. 비기능 요구사항

- **60fps 유지**: 줌·팬·드래그 중 frame drop < 5%
- **메모리**: 200 메모 + 가상화 시 DOM 노드 ≤ 30 (viewport 안 + 약간의 over-render)
- **접근성**: 키보드만으로도 카드 선택 가능 (Tab → 카드 순회), 화살표 키로 카드 이동
- **터치**: 모바일은 [[FEAT-mobile]]이 별도 구현. 본 feature는 데스크톱·태블릿 우선.

## 9. 다음 iteration

- **연결선 그리기** — 카드 hover 시 핸들 노출 → 다른 카드로 끌어 실선 생성. AI 추천 연결은 [[FEAT-ai-pipeline]]에서 점선 자동 표시.
- **지형도 모드** — 우하단 `▦` 버튼 → 전체 보드 한눈에 (zoom out 자동)
- **Canvas2D fallback 구현** — DOM 200+ 시 자동 전환 (Phase 2)
- **카드 정렬 도우미** — alt+drag로 격자 snapping (옵트인)
- **무한 캔버스 영역 확장** — 현재는 viewport 기준, 카드를 화면 밖으로 멀리 보내면 길찾기 어려움

## 10. 검증 방법 (DOD)

- [ ] e2e: 줌 50%/100%/200%에서 카드 드래그 마우스 정확히 따라옴
- [ ] e2e: 200 메모 배치 후 줌·팬 60fps 유지 (Chrome DevTools Performance 측정)
- [ ] e2e: Space+drag, 미들 마우스, 트랙패드 핀치 모두 작동
- [ ] 가상화 검증: viewport 밖 카드는 DOM 트리에 없음
- [ ] PRD §11 6 variant 시각 대조 (system/system-empty/board/board-empty/collapsed/dragging)
