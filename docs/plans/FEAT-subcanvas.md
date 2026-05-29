# FEAT-subcanvas 구현 계획

스펙: `docs/specs/FEAT-subcanvas.md`

## 코드베이스 파악 요약

- **Board = 캔버스.** `db/schema.ts`의 `Board`(평면), `Note.boardId`로 소속. `setCurrentBoard`가 보드 전환(페이드 200ms + viewport 복원). 시스템 보드는 boardId=null.
- 함 카드 모델: 전용 컬럼 없이 `content`에 JSON(`{__moss_subcanvas_v1__, boardRef}`)을 담는다 — comment 카드가 author/time을 content JSON에 담는 패턴 재사용.
- 카드 렌더 라우터 `cards/CardContent.tsx` (kind별 switch). 더블클릭은 `DraggableCard.onDoubleClick`.
- 사이드바 드롭: `Sidebar.tryDrop` → `addCardAt(toolId, ...)`. board는 CANVAS_GROUP에 있고 **현재 draggable 아님**.
- `board.png` 카드 에셋 없음 → 폴더/📦 스타일 div로 렌더.
- 보드 undo cascade 패턴: `removeBoardWithUndo`/`undoBoardRemove` 참고.

## 태스크 (순서 = 의존 순)

### T1 — 데이터 모델 (schema + storage)
- `db/schema.ts`: `NoteKind`에 `"board"` 추가. `Board`에 `parentBoardId?: string | null`. Dexie `version(4)`: `boards` 인덱스에 `parentBoardId` 추가(데이터 upgrade는 no-op — 기존 보드 undefined 유지).
- `storage.ts`: `loadBoards`는 그대로(전체 로드 → 브레드크럼/트리에 충분). 카드 카운트용 `countCardsByBoard(boardIds): Promise<Record<string, number>>` 추가(한 번에 집계, N+1 회피). cascade 삭제용 `removeBoardCascade(rootBoardId)` 추가 — parentBoardId 체인 따라 하위 보드+노트 일괄 삭제.
- 검증: 타입체크 통과, 기존 storage 테스트 그린.

### T2 — workspace store: 서브캔버스 액션
- 인코딩: `encodeCardContent`/`decodeNoteToCard`에 board kind 분기(`__moss_subcanvas_v1__` 마커, boardRef 복원 → `card.boardRef`). `Card`에 `boardRef?: string` 추가.
- `isCaptureKind`: board 제외(comment처럼) → 더블클릭 시 편집 안 함, drop 시 편집 모드 안 들어감.
- `kindForTool("board") → "board"`, `widthForKind("board") → 200`, `aspectForKind` board 비율 추가(정사각 1).
- 신규 state: `subcanvasCounts: Record<string, number>`(boardRef→자식 카드 수). 보드 로드 시(`loadFromStorage`/`setCurrentBoard`) board 카드들의 boardRef로 카운트 채움.
- 액션:
  - `createSubcanvas(x, y): string` — 새 보드(parentBoardId=현재) 생성 + board 카드(boardRef) 생성·영속. 카드 id 반환.
  - `enterSubcanvas(cardId)` — 카드 boardRef로 `setCurrentBoard`.
  - `goToParent()` — 현재 보드 parentBoardId로 전환(없으면 no-op).
  - `getBreadcrumb()` selector — currentBoardId에서 parentBoardId 체인 → `{id,name}[]`(루트→현재). 시스템 보드면 시스템 라벨.
  - `moveCardToSubcanvas(cardId, funnelCardId)` — cardId boardId를 funnel의 boardRef로 변경 + 현재 cards에서 제거 + 카운트 갱신. 사이클 가드(자기 조상으로 이동 금지).
  - `remove`/`removeSelected`에 board 카드면 cascade 삭제 연결(스토리지 `removeBoardCascade` + undo 스냅샷은 기존 board undo 패턴 확장 — MVP는 즉시 삭제 + 보드 undo 토스트 재사용 검토; 과하면 단순 삭제).
- 검증: 단위 테스트(아래 T7).

### T3 — 함 카드 렌더
- `cards/board/Content.tsx` 신규: 📦 + 보드명(boards에서 boardRef로 조회, 빈 이름 i18n) + "카드 N개"(subcanvasCounts). 디자인 토큰·종이 톤 유지(shadcn 금지).
- `CardContent.tsx`: `case "board"` 추가.
- `DraggableCard.onDoubleClick`: `card.kind === "board"` → `enterSubcanvas(card.id)` (isExpandable 분기 앞).
- `expandable.ts`: board 비확장 확인(기본 false면 OK).

### T4 — 사이드바 드롭 → createSubcanvas
- `Sidebar`: board 아이템만 `draggable + onDrop` 전달(`SidebarItem`에 board도 드래그 가능하게). `tryDrop`: `toolId === "board"`면 `createSubcanvas(wx, wy)` 호출(addCardAt 대신). 시스템 보드에서는 함 생성 금지(스펙 비목표) — 토스트로 "사용자 보드에서만" 안내 또는 드롭 무시.

### T5 — 브레드크럼
- `Breadcrumb.tsx` 신규: `getBreadcrumb()` 기반. 조상 조각만 `루트 › 캔버스B ›`(클릭 → setCurrentBoard), 현재 보드는 BoardPicker가 표시. depth 0이면 아무것도 안 그림.
- `Header.tsx`: BoardPicker 앞에 `<Breadcrumb />` 배치.

### T6 — Esc 한 단계 위로
- `Canvas.tsx` keydown: 비-펜·비-편집·selectedIds 0개 분기에서 Escape → parentBoardId 있으면 `goToParent()`, 없으면 기존 clearSelection. 선택 있을 때 Esc는 기존대로 선택 해제 우선.

### T7 — 카드 드래그로 함에 넣기
- `DraggableCard`: 단일 카드 드래그 종료(onUp, moved, !multi) 시 `document.elementFromPoint`로 드롭 위치의 `[data-card-id]` 조회 → board 카드이고 자기 아님 + 사이클 아니면 `moveCardToSubcanvas`. 드래그 중 hover 시 대상 함 하이라이트(store `dropTargetFunnelId` transient, board Content가 구독해 테두리 강조).
- 검증: 드롭 → 카드 이동 + 진입 시 존재 확인.

### T7-tests — 단위 테스트 (`state/__tests__/subcanvas.test.ts`)
- createSubcanvas: 보드+카드 생성, parentBoardId/boardRef 연결.
- enterSubcanvas/goToParent/getBreadcrumb: 3단계 중첩 왕복.
- moveCardToSubcanvas: boardId 변경 + 사이클 가드(자기 조상으로 이동 시 no-op).
- cascade 삭제: 자식 보드+노트 함께 삭제.
- Dexie version(4) upgrade 무손실.

## 위험 / 트레이드오프
- **content JSON에 boardRef 저장** — 전용 컬럼보다 가볍지만, board 카드 content가 JSON이라 AI 임베딩 큐에 들어가면 노이즈. → board 카드는 `aiOptOut` 또는 enqueue skip 처리.
- **cascade 삭제 undo** — 보드 트리 깊으면 스냅샷 복잡. MVP는 단순 cascade + (가능하면) 기존 5초 undo 재사용. 과하면 undo 없이 삭제하고 후속.
- **드래그 드롭 사이클** — 함을 자기 자손에 넣으면 트리 깨짐. parentBoardId 체인 검사로 차단.
