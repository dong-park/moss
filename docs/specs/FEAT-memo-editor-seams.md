# FEAT-memo-editor-seams (P0)

**Status**: ✅ complete (2026-06-04) — P0 + W1~W10 합본 게이트 그린(tsc 0 · eslint 0 · vitest 673). `feat/memo-editor-seams` → main 머지(--no-ff). W1~W10 전원 완료.
**Squad**: [[_squad-memo-production]] · 핫스팟 사전 리팩터.

## 1. 목표

메모 에디터(`MarkdownEditor.tsx`)와 카드 persist를 **확장 슬롯/seam 구조**로 리팩터해, 후속 10 워커가 각자 신규 파일 + 등록 1줄만으로 기능을 붙이게 한다. **기능 추가 0, 동작 불변** — 순수 구조 변경. 슬롯이 비어 있어도 현재와 픽셀·행동이 동일해야 한다.

## 2. 범위

**포함:**
- `_shared/editor/extensions.ts` 신설 — `editorPlugins[]` · `pasteHandlers[]` · `bubbleMenuItems[]` 세 등록 배열 + 타입 export.
- `MarkdownEditor.tsx`의 `MilkdownInner`를 슬롯 소비형으로 리팩터: `.use(commonmark/gfm/listener/markdownPlaceholder)` → `.use(editorPlugins)`, paste 파이프라인 ProseMirror 플러그인 합성, BubbleMenu 호스트 마운트.
- `EditorRegion` 래퍼 컴포넌트 — 에디터 본문을 감싸는 `role`/`aria-label` 기본 컨테이너(W9가 보강할 표면).
- `state/cardPersist.ts` 신설 — 기존 `persistCardDebounced`(workspace.ts:761) 이전 + `flushCard(id)` · `flushAll()` 추가. workspace.ts는 이 모듈에 위임.

**제외(워커 몫):** 실제 plugin/handler/bubble 항목, flush 호출부(beforeunload), 검색·동기화·정리 로직. P0는 **빈 슬롯과 seam만** 판다.

## 3. 수용 기준 (GWT)

- **AC-1** Given 슬롯이 전부 빈 상태, When 메모 카드/펼침 모달을 편집·렌더, Then 리팩터 전과 동일하게 동작(타이핑·blur 저장·placeholder·펜 overlay 정렬 불변).
- **AC-2** Given `editorPlugins`에 더미 플러그인 1개 추가, When 에디터 마운트, Then 해당 플러그인이 활성(슬롯이 실제로 소비됨).
- **AC-3** Given `pasteHandlers`에 `() => true` 등록, When 붙여넣기, Then 기본 동작이 차단됨(파이프라인 합성 검증). 빈 배열이면 기본 붙여넣기 정상.
- **AC-4** Given `bubbleMenuItems` 빈 배열, When 텍스트 선택, Then 아무 툴바도 안 뜸(호스트가 빈 항목에 null). 1개 추가 시 선택 시 노출.
- **AC-5** `flushCard(id)`는 debounce 타이머를 무시하고 즉시 IndexedDB에 기록하고 resolve. `flushAll()`은 대기 중 모든 카드 flush.
- **AC-6** `npx tsc --noEmit` 0, `npx vitest run` 기존 그린 유지(+슬롯/flush 단위 테스트 신규).

## 4. 의존성

없음(critical path 출발점). **이 스펙이 W1~W10의 선행.**

## 5. 데이터 모델

변경 없음. `Card.content`(markdown), `Card.overlay`(펜 JSON) 그대로. persist 동작 동일, flush 진입점만 추가.

## 6. 인터페이스 (확정 후 보드 §인터페이스에 복사)

```ts
// _shared/editor/extensions.ts
import type { MilkdownPlugin } from "@milkdown/ctx";
import type { EditorView } from "@milkdown/prose/view";

/** ProseMirror paste/drop 핸들러. true 반환 시 기본 동작 차단(소비). 등록 순서대로 시도. */
export type PasteHandler = (view: EditorView, event: ClipboardEvent | DragEvent) => boolean;

/** 인카드 버블 툴바 항목. */
export type BubbleMenuItem = {
  id: string;
  label: string;          // 표시(예: "B")
  aria: string;
  isActive?: (view: EditorView) => boolean;
  run: (view: EditorView) => void;
};

export const editorPlugins: MilkdownPlugin[];     // 기본 4개(commonmark/gfm/listener/placeholder) + 워커 추가
export const pasteHandlers: PasteHandler[];        // 빈 배열로 출발
export const bubbleMenuItems: BubbleMenuItem[];    // 빈 배열로 출발
```

```ts
// state/cardPersist.ts
export function persistCardDebounced(card: Card, boardId: string | null): void;  // workspace.ts에서 이전
export function flushCard(id: string): Promise<void>;   // 해당 카드 debounce 취소+즉시 기록
export function flushAll(): Promise<void>;               // 대기 중 전부 flush
```

```tsx
// _shared/editor/EditorRegion.tsx — 에디터 본문 래퍼(W9 보강 표면)
export function EditorRegion(props: { children: ReactNode; editable: boolean }): JSX.Element;
// 기본: <div role="textbox" aria-multiline aria-label={t("workspace.memo.editor.label")}>
```

paste 파이프라인 합성 방식: `MilkdownInner`에서 ProseMirror `Plugin`을 만들어 `props.handlePaste`/`handleDrop`이 `pasteHandlers`를 순서대로 호출, 첫 `true`에서 중단. Milkdown `$prose` util로 주입.

## 7. 시각·인터랙션

시각 변화 0(구조 리팩터). BubbleMenu 호스트는 빈 항목일 때 DOM 미생성. `EditorRegion`은 기존 `.moss-md` 컬럼 div를 대체하되 클래스·스타일 동일 유지(펜 정렬 좌표계 보존 — `MEMO_CONTENT_WIDTH`·padding 6/9·text-[13px] 불변).

## 8. 비기능

- 펜 overlay 정렬 불변이 최우선 제약(좌표계 건드리지 말 것).
- SSR 폴백 경로(useIsClient) 유지.
- 편집 중 remount 회피 로직(`[editable, editable ? "" : value]` deps) 보존.
- 슬롯 배열은 모듈 로드 시 1회 구성(런타임 push 금지 — 트리 일관성).

## 9. 다음 iteration

W1~W10. P0는 그들의 등록 지점만 연다.

## 10. DOD

- [ ] extensions.ts 3슬롯 + 타입 export, MarkdownEditor 슬롯 소비로 동작 불변
- [ ] EditorRegion 컨테이너, cardPersist.ts(flush 포함), workspace.ts 위임 전환
- [ ] AC-1~6 통과, 펜 정렬·placeholder·blur저장 회귀 0
- [ ] 보드 §인터페이스를 실제 시그니처로 갱신(워커 해제 신호)
