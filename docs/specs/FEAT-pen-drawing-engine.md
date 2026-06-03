# FEAT-pen-drawing-engine · 드로잉 엔진 통합

> 메모 overlay와 handwriting 카드가 각각 가진 두 드로잉 구현을 하나로 합쳐, 펜 버그를 한 곳에서만 고치게 한다.

**Status**: spec
**Estimated**: M~L
**Owner**: (WS-A)
**Reference**: `/tldr` 리뷰 (2026-06-03) — 판정표 ⚠️ 2건 + 액션 A1/C1/D2

---

## 1. 목표 (Job Statement)

개발자가 / 펜 그리기 동작(점 입력·지우개·undo·정렬)을 고칠 때 / 단일 드로잉 엔진 한 곳만 수정하면 / 메모 overlay와 handwriting 카드 양쪽에 동일하게 반영되도록 한다.

현재는 `DrawingLayer.tsx`(메모 overlay·펼침 모달)와 `blocks/useHandwriting.ts`(handwriting 카드·블록)가 `toLocal`/`finishStroke`/`pathsIntersect`를 **각각 중복 구현**한다. 스펙 [[FEAT-markdown-memo-pen]] D4("그리기 로직 단일 추출")가 절반만 달성된 상태다.

## 2. 범위

### 포함 (in-scope)
- `DrawingLayer.tsx`와 `useHandwriting.ts`의 그리기 코어(`toLocal`/`finishStroke`/`pathsIntersect`/draft 상태)를 **단일 소스로 수렴**.
- **A1**: 수렴 엔진의 `finishStroke`에서 `onChange`/`onPathsChange`를 `setDraft` 업데이터 **밖**(이벤트 핸들러 본문)에서 호출 — "Cannot update a component while rendering" 패턴 제거.
- **D2**: 탭(점 1개, `draft.length >= 1`)도 점으로 저장 — 마침표·점 주석 가능.
- `handwriting/Content.tsx`를 수렴 엔진 호출부로 이관.
- `text/Content.tsx`의 overlay 렌더 블록을 수렴 엔진으로 교체(하단 overlay JSX **만**).
- `MemoExpandDialog.tsx`의 펜 렌더 부분을 수렴 엔진으로 교체.

### 제외 (out-of-scope, 다른 단위 담당)
- 펜 모드 HUD·affordance·툴바 — [[FEAT-pen-mode-ux]]가 담당.
- `useHandwriting` **파일 삭제** — 이관 완료로 死 확정되면 [[FEAT-memo-pen-cleanup]] C2b가 제거.
- placeholder/학습성 — [[FEAT-memo-learnability]].
- 펜 색상·도형 — [[FEAT-markdown-memo-pen]] §9 보류 유지.

## 3. 수용 기준 (Acceptance Criteria, GWT)

### AC-1 단일 정의
- **Given** 통합 후 코드베이스
- **When** `toLocal`/`finishStroke`/`pathsIntersect`를 grep
- **Then** 각각 **정확히 1개** 정의만 존재하고, 메모 overlay·handwriting 양쪽이 그것을 공유한다.

### AC-2 (A1) render-중 setState 제거
- **Given** handwriting 카드 또는 메모 overlay에서 펜 모드 ON
- **When** stroke를 그려 `finishStroke` 발생
- **Then** React "Cannot update a component while rendering" 경고가 콘솔에 **없고**, stroke가 정상 저장된다.

### AC-3 (D2) 탭=점 1개
- **Given** 펜 모드 ON
- **When** 드래그 없이 한 점을 톡 찍음
- **Then** 그 위치에 점(dot) 하나가 저장·렌더된다(기존엔 `draft.length>1`만 저장돼 무시됨).

### AC-4 회귀 무손상
- **Given** 기존 테스트 `DrawingLayer`·`penMode`·`handwriting`(+ MemoExpand SC-1~3b)
- **When** 통합 후 vitest 실행
- **Then** 전부 GREEN(지우개 근접 판정·undo/redo/clear·굵기 클램프 보존).

## 4. 의존성

### 다른 feature
- **의존받음**: [[FEAT-pen-mode-ux]] — 수렴 엔진 props 시그니처를 읽어 HUD/툴바가 도구·굵기를 표시.
- **의존받음**: [[FEAT-memo-pen-cleanup]] C2b — 이 단위가 `handwriting/Content`를 이관해야 `useHandwriting` 死가 확정됨.

### 코드 기준점
- `web/src/components/workspace/cards/_shared/DrawingLayer.tsx`
- `web/src/components/workspace/cards/_shared/blocks/useHandwriting.ts`
- `web/src/components/workspace/cards/handwriting/Content.tsx`
- `web/src/components/workspace/cards/text/Content.tsx` (하단 overlay JSX만)
- `web/src/components/workspace/cards/MemoExpandDialog.tsx`
- 직렬화: `web/src/state/cardContent.ts` (`parseHandwriting`/`serializeHandwriting`/`HandwritingPoint`/`coercePaths`) — 변경 없이 재사용.

## 5. 데이터 모델

변경 없음. 좌표는 기존대로 `HandwritingPoint {x,y}`, 직렬화는 `{paths:[[{x,y}...]...]}` JSON. 좌표계는 고정폭 컬럼(`MEMO_CONTENT_WIDTH=720`) 1:1 픽셀 유지(viewBox 없음).

## 6. 인터페이스

수렴 목표 — 단일 훅 또는 단일 컴포넌트. 권장 형태(둘 중 택1, _squad 보드에 확정 기록):

### 옵션 A — 단일 컴포넌트 (DrawingLayer 흡수)
```tsx
<DrawingLayer
  value={string}          // 직렬화 paths (source of truth)
  active={boolean}        // false면 pointer-events:none → 클릭 통과
  tool={"pen" | "eraser"}
  penWidth={number}       // 1~12
  onChange={(json: string) => void}
  stroke={string?}        // CSS 변수, 기본 본문색
/>
// undo/redo/clear/굵기·도구 토글 키 = 호출측 소유(카드 키보드 or 펜 모드 전역)
```

### 옵션 B — 단일 훅 (useHandwriting 흡수)
```ts
useDrawing({ paths, active, onPathsChange, svgRef }): {
  allPaths, hasPaths, tool, penWidth,
  onPointerDown/Move/Up, handleDrawingKey, clearAll
}
```

**확정 산출물**: 선택한 시그니처를 `_squad-memo-pen-followup.md` "엔진 API 확정" 칸에 박아 WS-B/C/D가 참조.

상수 단일화: `PEN_MIN/PEN_MAX/PEN_DEFAULT`(useHandwriting)와 `PEN_MIN_WIDTH/PEN_MAX_WIDTH/PEN_DEFAULT_WIDTH`(workspace.ts)가 중복 — 한 곳(`_shared`)으로 통일하고 양쪽 import.

## 7. 시각·인터랙션

- 사용자 체감 동작 변화 없음(점 1개 저장 추가 제외). 내부 리팩터가 본질.
- 펜=crosshair, 지우개=cell 커서 유지.
- 컬럼 1:1 좌표 — 카드↔모달 어디서 그려도 같은 글자 위 정렬(기존 보존).

## 8. 비기능 요구사항

- **성능**: stroke 지연 체감 없음(기존 수준). draft 누적은 pointermove마다 배열 push — 기존과 동일.
- **정확성**: cross-component setState 경고 0 (AC-2).
- **접근성**: undo/redo/clear/굵기·도구 키보드 도달 보존.
- **i18n**: 신규 문자열 없음.

## 9. 다음 iteration (의도적 보류)

- 펜 입력 throttle/coalesced pointer events — 성능 이슈 확인 시.
- 압력(pressure) 기반 굵기 — 단색 단일 굵기 먼저.

## 10. 검증 방법 (DOD)

- [ ] tsc `--noEmit` 클린, eslint 클린
- [ ] `toLocal`/`finishStroke`/`pathsIntersect` grep → 각 1개 정의 (AC-1)
- [ ] vitest `DrawingLayer`·`penMode`·`handwriting`·`MemoExpand` GREEN (AC-4) — Linux/CI
- [ ] 브라우저 실측: handwriting 카드+메모 overlay 그리기, 콘솔 경고 0 (AC-2), 탭=점 (AC-3)
- [ ] 자기 파일 외 변경 없음 (`git diff --stat` — 특히 `text/Content.tsx`는 overlay JSX만)
