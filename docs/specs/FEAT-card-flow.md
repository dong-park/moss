# FEAT-card-flow · 카드 간 키보드 흐름

> 카드 사이를 마우스 없이 흐를 수 있어야 한다. 편집 종료·다음 카드 진행·카드 선택 이동·편집 진입을 키보드로.

**Status**: spec 작성
**Owner**: TBD
**Estimated**: M
**Blueprint**: `docs/moss.blueprint.json#features[id="FEAT-card-flow"]` (신규)
**Parent plan**: [[SIDEBAR-CARDS-PHASE2]] · 카드 UX Phase 2 묶음

---

## 1. 목표 (Job Statement)

캡처 후 연달아 캡처, 캔버스에서 카드 사이 시각 이동, 편집 모드 토글을 모두 키보드만으로. 4가지 단축키(`Cmd+Enter` · `Tab`/`Shift+Tab` · `Esc` · `Cmd+E`)를 9종 + checklist 전 카드에 일관 적용해, "사이드바 단축키로 카드 생성 → 입력 → Cmd+Enter → 다음 카드 입력" 무중단 캡처 흐름을 만든다.

## 2. 범위

### 포함 (in-scope)

- `Cmd/Ctrl+Enter`: 편집 종료 + **같은 종류의 다음 카드** 자동 생성 (현재 카드 아래 64px). 캡처 카드 한정. 빈 카드면 카드 생성 안 함(편집만 종료).
- `Tab` / `Shift+Tab`: 캔버스 포커스 상태에서 z-order 또는 위치 기반 다음 / 이전 카드로 선택 이동. 입력 중에는 비활성(기본 Tab 포커스 흐름 보존).
- `Esc`: 편집 종료 + 현재 카드 선택 유지 (이미 부분 구현되어 있으면 정합 확인).
- `Cmd/Ctrl+E`: 선택된 카드를 편집 모드 진입 (마우스 없이). [[FEAT-card-entry-mode]] 진입 흐름 발동.
- textarea 안 Enter (no modifier)는 줄바꿈 — Cmd+Enter만 next-card 발동.

### 제외 (out-of-scope)

- 카드 종류 변환 / 복제 / 삭제 단축키 — 본 FEAT 외 (별 FEAT)
- 보드 간 이동 단축키 — `useBoardShortcuts.ts` 영역
- Cmd+Enter로 생성되는 "다음 카드"의 종류 자동 추론 (지금은 같은 종류 고정) — §9 다음 iteration
- 다중 선택 상태에서 Tab 동작 — §9 다음 iteration

## 3. 수용 기준 (Acceptance Criteria)

### AC-1: Cmd+Enter로 다음 카드 진행 (REQ-flow-1)

- **Given** 캡처 카드 편집 중·콘텐츠 비어있지 않음
- **When** Cmd/Ctrl+Enter
- **Then** 현재 카드의 편집이 종료되고, 같은 `kind`·같은 toolId의 새 카드가 현 카드 바로 아래 64px 떨어진 위치(같은 x)에 생성되며, 새 카드가 자동 편집 모드로 진입한다 ([[FEAT-card-entry-mode]] 발동).

### AC-2: 빈 카드 Cmd+Enter는 카드 생성 안 함 (REQ-flow-2)

- **Given** 캡처 카드 편집 중·콘텐츠 비어있음 (`content === ""`)
- **When** Cmd/Ctrl+Enter
- **Then** 편집만 종료되며 새 카드 생성 안 됨. 사용자 실수(빈 카드 양산) 방지.

### AC-3: Tab / Shift+Tab으로 카드 선택 이동 (REQ-flow-3)

- **Given** 카드 비편집 상태, `selectedIds.length === 1`, 캔버스에 포커스
- **When** Tab
- **Then** 같은 보드 안 카드 중 위치 기준 다음 카드(상단→하단, 동일 y에서는 좌→우)가 선택됨
- **When** Shift+Tab → 이전 카드로 선택 이동

### AC-4: Cmd+E로 선택 카드 편집 진입 (REQ-flow-4)

- **Given** 카드 1개 선택, 편집 비활성
- **When** Cmd/Ctrl+E
- **Then** 선택 카드가 편집 모드 진입 ([[FEAT-card-entry-mode]] 진입 흐름 발동)
- **And** isTyping() 가드가 입력 중 Cmd+E를 무시한다(타이핑 중 의도치 않은 카드 전환 방지)

### AC-5: 텍스트 입력 중 Enter는 줄바꿈 (REQ-flow-5)

- **Given** textarea 안 커서, modifier 없음
- **When** Enter
- **Then** 줄바꿈 발생 (편집 종료 안 됨, 다음 카드 안 생성됨)

### AC-6: 기존 단축키 회귀 안전 (REQ-flow-6)

- **Given** 본 FEAT 적용 후
- **When** Cmd+1~0 / Cmd+Shift+N
- **Then** 기존 [[FEAT-capture]] 단축키가 그대로 동작

## 4. 의존성

### 블루프린트 참조

- 신규 requirements: REQ-flow-1 ~ REQ-flow-6 (블루프린트에 추가 필요)
- 영향 화면: SCR-workspace-canvas
- 영향 flow: FLOW-capture (step "다음 카드 진행"·"카드 사이 이동")

### 다른 feature

- **의존**: [[FEAT-card-entry-mode]] — Cmd+Enter로 생성된 새 카드 / Cmd+E로 진입한 기존 카드의 자동 포커스는 본 FEAT가 직접 처리하지 않고 entry-mode 효과로 따라옴. 동시 진행 가능하지만 entry-mode가 먼저 머지되면 UX가 매끄러움(없어도 동작은 함, 다만 사용자가 클릭 한 번 더 해야 함).
- **의존받음**: 없음.

### 기존 코드 접점

- `src/components/workspace/useShortcuts.ts:15` — 기존 hook. 본 FEAT는 별 hook 추가(`useCardFlowShortcuts`)로 책임 분리. 같은 keydown 이벤트에서 처리 순서 충돌 없도록 e.preventDefault 시점·키 매칭 패턴 일치.
- `src/components/workspace/ShortcutsBinder.tsx:11` — `useCardFlowShortcuts()` 호출 추가
- `src/state/workspace.ts` — 신규 store actions 3개 (§6 참조)
- 기존 `addCardAt(toolId, x, y)` 그대로 사용 (Cmd+Enter 내부에서 호출)

### 외부 라이브러리

- 추가 의존 없음.

## 5. 데이터 모델

변경 없음. 기존 `cards: Card[]`, `selectedIds: string[]`, `editingId: string | null` 그대로 활용. `Card`에 `toolId` 또는 `kind`로부터 toolId 역추적이 가능해야 하므로 카드 생성 시 toolId 보존이 필요할 수 있음(현재 `kindForTool` 일방향) — §6에서 다룸.

## 6. 인터페이스

### Store actions (workspace.ts 신규)

```ts
/**
 * 현 카드 편집 종료. 콘텐츠가 비어있지 않으면 같은 종류의 다음 카드를 아래 64px에 생성·편집 모드 진입.
 * 빈 카드면 편집만 종료하고 null 반환.
 */
commitAndAddNext(currentCardId: string): string | null;

/**
 * selectedIds[0] 기준 위치(y, x 순) 정렬에서 인접 카드로 선택 이동.
 * direction: 1 = 다음, -1 = 이전. 보드 경계 도달 시 wrap-around 안 함 (no-op).
 */
focusNextCard(direction: 1 | -1): void;

/**
 * selectedIds[0]을 editingId로 설정 (캡처 카드만). 선택 없거나 캡처 아니면 no-op.
 */
enterEditOnSelected(): void;
```

### Hook (cards/_shared 또는 workspace/ 위치)

```ts
// src/components/workspace/useCardFlowShortcuts.ts
"use client";

import { useEffect } from "react";
import { useWorkspace } from "@/state/workspace";

export function useCardFlowShortcuts(): void {
  useEffect(() => {
    const isTyping = (el: Element | null): boolean =>
      !!el && (el as HTMLElement).matches?.("input, textarea, [contenteditable='true']");

    const onDown = (e: KeyboardEvent) => {
      const store = useWorkspace.getState();
      const target = e.target as Element | null;
      const typing = isTyping(target);
      const mod = e.metaKey || e.ctrlKey;

      // Cmd+Enter — 편집 중 카드에서 동작, 입력 중에도 발동
      if (mod && e.key === "Enter" && store.editingId) {
        e.preventDefault();
        store.commitAndAddNext(store.editingId);
        return;
      }

      // Cmd+E — 입력 중엔 비활성
      if (mod && (e.key === "e" || e.key === "E") && !e.shiftKey) {
        if (typing) return;
        e.preventDefault();
        store.enterEditOnSelected();
        return;
      }

      // Tab / Shift+Tab — 입력 중엔 기본 Tab 흐름 보존
      if (e.key === "Tab" && !mod) {
        if (typing) return;
        if (store.selectedIds.length !== 1) return;
        e.preventDefault();
        store.focusNextCard(e.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);
}
```

`ShortcutsBinder.tsx`에 `useCardFlowShortcuts()` 호출 1줄 추가.

### 새 카드 좌표 산정 (commitAndAddNext 내부)

- 새 카드 `y` = `current.y + current.height + 64`
- 새 카드 `x` = `current.x` (같은 열 유지)
- `kind`·`toolId` = current와 동일. `Card`에 toolId 보존 필요 — 없으면 `kindToDefaultToolId(kind)` 헬퍼로 역매핑(text→text, checklist→checklist 등 직관적).

### Tab 정렬 기준 (focusNextCard 내부)

- 현 보드 카드만 대상
- 정렬: `(c.y, c.x)` 사전식. 동일 y에서는 좌→우.
- 현 선택 카드 index 찾아 ±direction. 경계는 no-op.

### 외부 API

해당 없음.

## 7. 시각·인터랙션

- Cmd+Enter 직후 새 카드가 fade-in(200ms). 기존 카드 outline은 deselect 처리 (selectedIds = 새 카드).
- Tab 이동 시 선택 outline이 다음 카드로 200ms 이내 전환. 새 카드가 viewport 밖이면 캔버스가 부드러운 pan(300ms ease-out)으로 카드를 viewport 안으로 들임.
- Cmd+E 진입 시 카드 진입 효과는 [[FEAT-card-entry-mode]]가 담당.

## 8. 비기능 요구사항

- **성능**: Cmd+Enter → 새 카드 mount + focus ≤ 100ms (브라우저 기준). Tab 이동 시 store 갱신 ≤ 16ms.
- **접근성**: Tab은 캔버스 자체 영역 안 키보드 인터랙션 — 브라우저 기본 Tab 흐름(헤더·사이드바·푸터)과 충돌 안 나도록 `e.preventDefault`는 캔버스 포커스 상태에서만. 입력 중엔 Tab 기본 동작 통과.
- **프라이버시**: 변경 없음.
- **i18n**: 단축키 표기 한국어 텍스트(예: "다음 카드로 이동")는 카드 UX onboarding(§9, 별 FEAT)에서 다룸. 본 FEAT는 단축키 동작만.
- **회귀 안전**: 기존 `useShortcuts`의 Cmd+1~0·Cmd+Shift+N 정상 (별 hook이라 독립). `useBoardShortcuts`와 Tab 충돌 없음 확인.

## 9. 다음 iteration (의도적 보류)

- "다음 카드 종류 자동 추론" — 체크리스트 다음엔 체크리스트, 텍스트 다음엔 텍스트가 기본이지만 사용자가 가끔 종류 전환 원함. `Cmd+Shift+Enter`로 종류 선택 팝업? 추가 spec 필요.
- 다중 선택 상태에서 Tab 동작 — 다중 선택 전체를 한 묶음으로 묶은 시각 outline 이동?
- 카드 그리드 정렬 시 Tab 이동 순서 = 시각적 z-order — 정렬이 위치 외 z-index도 고려해야 하는지 검토.
- 단축키 onboarding tooltip — 본 FEAT 단축키가 발견되도록 첫 사용 시 한 번 표시.
- 보드 경계에서 Tab 시 wrap-around 옵션.

## 10. 검증 방법 (DOD)

- [ ] AC-1~6 단위·통합 테스트 (Vitest + React Testing Library)
- [ ] `useShortcuts` 회귀 테스트 통과 (Cmd+1~0 / Cmd+Shift+N 정상)
- [ ] `useBoardShortcuts` 회귀 테스트 통과 (Tab 충돌 없음)
- [ ] textarea 안 Enter 줄바꿈 시각·단위 테스트
- [ ] viewport 밖 카드 pan 시각 QA (`npm run dev`로 확인)
- [ ] commitAndAddNext / focusNextCard / enterEditOnSelected 각각 store 단위 테스트
- [ ] `docs/specs/_index.md`에 Phase 2 카드 UX 항목 등록 및 Status 갱신
- [ ] AC-6 — 기존 카드 49건 unit + capture 회귀 0건
