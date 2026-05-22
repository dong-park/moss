# FEAT-card-entry-mode · 카드 진입 모드 표준화

> 캡처 카드를 만들자마자 마우스 없이 입력을 시작할 수 있어야 한다. 종류별 첫 포커스 위치를 명시·표준화.

**Status**: ✅ 구현 완료 (2026-05-22) — web@a034539, 27건 신규 unit + 회귀 0 (web 465/465)
**Owner**: W1 워커 (worktree dispatch)
**Estimated**: M
**Blueprint**: `docs/moss.blueprint.json#features[id="FEAT-card-entry-mode"]` (신규)
**Parent plan**: [[SIDEBAR-CARDS-PHASE2]] · 카드 UX Phase 2 묶음

---

## 1. 목표 (Job Statement)

캡처 흐름에서 사용자가 "사이드바 드롭 / 도구 클릭 / 단축키(Cmd+1~0, Cmd+Shift+N)" 중 어느 경로로 카드를 만들었든, **추가 클릭 없이** 종류별 가장 자연스러운 입력 지점에 키보드 포커스가 자동으로 박혀 첫 키스트로크가 손실 없이 카드 콘텐츠에 반영되도록 한다. 캡처 9종 + checklist 카드 전 종에 동일한 규약 적용.

## 2. 범위

### 포함 (in-scope)

- 캡처 카드 mount 시점 또는 `editingId` 전이 시점에 자동 포커스 발동
- 카드 종류별 기본 포커스 타겟 표 (10종 — text · checklist · highlight · code · image · file · audio · handwriting · mindmap · link)
- 단축키 / 드롭 / 사이드바 클릭 3 경로 모두 동일 진입 표준
- 편집 해제(Esc) 후 더블클릭 재진입 시 동일 포커스 타겟에 다시 박힘
- 공통 헬퍼 `useAutoFocusOnEdit(ref, isEditing)`를 `cards/_shared/`에 추가

### 제외 (out-of-scope)

- 카드 간 포커스 이동 / Cmd+Enter로 다음 카드 진행 — [[FEAT-card-flow]]가 담당
- 모바일 가상 키보드 띄우기 — [[FEAT-mobile]] 범위
- 첫 진입 사용자에게 단축키 onboarding tooltip 노출 — §9 다음 iteration
- 캡처가 아닌 캔버스 정리 도구(line / board / column / comment) — 본 FEAT 범위 외

## 3. 수용 기준 (Acceptance Criteria)

### AC-1: 캡처 카드 생성 직후 자동 포커스 (REQ-entry-1)

- **Given** 사용자가 사이드바 캡처 도구를 드롭하거나 클릭하거나 단축키(Cmd+1~0 / Cmd+Shift+N)로 사용
- **When** 카드가 캔버스에 mount되고 `editingId === card.id`인 상태로 진입
- **Then** 카드 종류별 기본 포커스 타겟(§6 표)에 `:focus`가 즉시 박힌다 (브라우저 기준 mount 후 1 frame 이내, jsdom 단위 테스트 기준 50ms 이내)

### AC-2: 종류별 포커스 타겟 일관성 (REQ-entry-2)

- **Given** 10종 카드를 각각 생성 (text / checklist / highlight / code / image / file / audio / handwriting / mindmap / link)
- **When** mount 완료
- **Then** §6 표의 selector가 `document.activeElement`와 정확히 매치된다

### AC-3: 추가 클릭 없이 입력 (REQ-entry-3)

- **Given** 카드가 mount되어 자동 포커스됨
- **When** 사용자가 키보드 입력 (예: "안녕")
- **Then** 첫 키스트로크부터 손실 없이 카드 콘텐츠에 반영됨 (마운트 직후 입력 race condition 없음)

### AC-4: 편집 해제 후 재진입 (REQ-entry-4)

- **Given** 카드를 한 번 편집 종료(Esc 또는 외부 클릭)한 후 다시 더블클릭 또는 [[FEAT-card-flow]]의 Cmd+E
- **When** `editingId`가 다시 그 카드 id로 전이
- **Then** 동일한 §6 selector에 포커스가 다시 박힘

### AC-5: 비-캡처 카드는 자동 진입 안 함 (REQ-entry-5)

- **Given** 캡처가 아닌 카드(예: comment 또는 향후 도입될 line/board/column)
- **When** 생성
- **Then** `editingId`가 세팅되지 않으며 자동 포커스도 발동하지 않음 (기존 동작 보존)

## 4. 의존성

### 블루프린트 참조

- 신규 requirements: REQ-entry-1 ~ REQ-entry-5 (블루프린트에 추가 필요)
- 영향 화면: SCR-workspace-canvas (캡처 카드 mount 흐름)
- 영향 flow: FLOW-capture (step "도구 선택 → 카드 생성 → 입력 시작")

### 다른 feature

- **의존**: 없음 (독립 P1)
- **의존받음**: [[FEAT-card-flow]] — Cmd+E·Cmd+Enter 후 새/기존 카드의 자동 포커스가 본 FEAT 효과에 기댐

### 기존 코드 접점

- `src/state/workspace.ts:713 addCardAt` — 이미 `editingId: isCapture ? id : null` 처리 중. **변경 안 함**.
- `src/components/workspace/cards/{kind}/Content.tsx` 10종 — 본 FEAT가 자동 포커스 추가
- `src/components/workspace/cards/_shared/` — `useAutoFocusOnEdit` 헬퍼 신규 추가

### 외부 라이브러리

- 추가 의존 없음 (`useEffect` + `ref.current.focus()` 기본 패턴)

## 5. 데이터 모델

변경 없음. 기존 `editingId: string | null` 그대로 활용.

## 6. 인터페이스

### 카드 종류별 기본 포커스 타겟

| kind | selector (data-attr 기준) | 사유 |
|---|---|---|
| **text** | `textarea[data-card-input]` | 본문 입력 시작점 |
| **checklist** | `[data-card-line="0"] input[type="text"]` | 첫 항목 라벨 |
| **highlight** | `textarea[data-card-input]` | 본문 입력 시작점 |
| **code** | `textarea[data-card-input]` | 코드 입력 시작점 |
| **image** | `[data-card-dropzone]` (tabindex=0) | 파일 선택 / 붙여넣기 trigger |
| **file** | `[data-card-dropzone]` (tabindex=0) | 파일 선택 / 드롭 trigger |
| **audio** | `button[data-card-record]` | 녹음 시작 버튼 (Space로 발동) |
| **handwriting** | `[data-card-canvas]` (wrapper `<div>`, tabindex=0) | 드로잉 시작 영역. 실제 element는 `<svg>`를 둘러싼 wrapper div — 의미상 "드로잉 영역 wrapper에 자동 focus" |
| **mindmap** | `[data-card-node="root"] input` | 루트 노드 텍스트 입력 |
| **link** | `input[data-card-url]` | URL 입력 |

> data-attr는 본 FEAT 안에서 새로 표준화. 기존에 `data-card-input`이 일부 카드에 있다면 그대로 유지하고 없는 카드에 추가.

### 공통 헬퍼 (cards/_shared/useAutoFocusOnEdit.ts 신규)

```ts
import { useEffect, RefObject } from "react";

/**
 * 카드 Content가 편집 모드로 전이될 때 ref 대상에 포커스를 박는다.
 * mount 직후 발동을 위해 `useEffect` dependency에 `isEditing` 포함.
 *
 * @example
 *   const inputRef = useRef<HTMLTextAreaElement>(null);
 *   useAutoFocusOnEdit(inputRef, editingId === card.id);
 */
export function useAutoFocusOnEdit<T extends HTMLElement>(
  ref: RefObject<T | null>,
  isEditing: boolean,
): void {
  useEffect(() => {
    if (!isEditing) return;
    const el = ref.current;
    if (!el) return;
    // textarea·input은 cursor를 end로 이동
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
    el.focus({ preventScroll: false });
  }, [isEditing, ref]);
}
```

### 카드 Content props 규약

모든 `cards/{kind}/Content.tsx`는 다음 패턴 준수:

```tsx
const inputRef = useRef<HTMLTextAreaElement>(null);
const isEditing = editingId === card.id;
useAutoFocusOnEdit(inputRef, isEditing);
return <textarea data-card-input ref={inputRef} ... />;
```

### Store actions

변경 없음. 기존 `setEditing(id)` / `addCardAt` 그대로.

### 외부 API

해당 없음.

## 7. 시각·인터랙션

- 포커스 외형은 기존 `:focus-visible` 스타일 그대로 — 새 디자인 토큰 도입 없음.
- 카드 생성 시 fade-in(200ms) 진행 중에도 포커스는 박혀 사용자 첫 키스트로크 수용.
- 사용자가 카드 모서리 drag로 위치 조정 중일 때는 자동 포커스 발동 안 함 (mount 시점 외엔 발동 안 함이 보장).

## 8. 비기능 요구사항

- **성능**: mount → focus 박힘 ≤ 1 frame (브라우저 16ms, jsdom 50ms 임계).
- **접근성**: tabindex 명시 — 자체 focusable이 아닌 wrapper(`[data-card-dropzone]`, `canvas`)엔 `tabindex=0`. 스크린리더에 카드 종류·이름 알림은 본 FEAT 범위 외(개별 카드 ARIA는 카드 v1에서 처리).
- **프라이버시**: 변경 없음.
- **i18n**: 변경 없음 (UI 텍스트 추가 없음).
- **회귀 안전**: 기존 더블클릭 진입 / Esc 종료 / 외부 클릭 종료 흐름 모두 보존.

## 9. 다음 iteration (의도적 보류)

- 첫 진입 사용자에게 카드별 단축키 onboarding tooltip 1회 표시 — 발견성 강화
- 캡처 도구 선택 시 사이드바에서 카드 위치 미리 표시(placeholder ghost)
- handwriting 카드 펜 굵기 기본값 사용자 설정 기억
- 모바일 가상 키보드 띄우기 자동화 → [[FEAT-mobile]] 범위

## 10. 검증 방법 (DOD)

- [ ] 10종 카드 각각에 단위 테스트: mount 후 `document.activeElement`가 §6 selector와 매치
- [ ] 통합: Cmd+1로 text 카드 생성 → 즉시 "테스트" 입력 → 카드 콘텐츠 "테스트" 확인 시나리오
- [ ] 통합: 카드 만들고 Esc → 더블클릭 재진입 → 동일 포커스 박힘
- [ ] AC-1~5 모두 GWT 통과
- [ ] `useAutoFocusOnEdit` 헬퍼 단위 테스트 (isEditing false → 미발동, true → focus 호출)
- [ ] `docs/specs/_index.md`에 Phase 2 카드 UX 항목 등록 및 Status 갱신
- [ ] 기존 회귀 0건 (특히 cards/__tests__/CardContent.*.test.tsx 49건 통과)
