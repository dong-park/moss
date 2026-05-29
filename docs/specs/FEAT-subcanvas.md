# FEAT-subcanvas · 캔버스 안의 "함" (서브 캔버스 컨테이너)

> 캔버스 위에 "함"을 놓아 그 안으로 들어가면 또 하나의 캔버스가 펼쳐진다. 흩어진 메모를 평면이 아니라 깊이로 정리한다.

**Status**: spec 작성
**Owner**: dong-park
**Estimated**: M
**Blueprint**: (신규 — 블루프린트 미등록, 추후 features[id="FEAT-subcanvas"] 추가)

---

## 1. 목표 (Job Statement)

메모가 많아진 사용자가 / 한 캔버스에서 관련 메모 묶음을 한 단계 안으로 치우고 싶을 때 / 캔버스 위에 "함"을 만들어 그 안의 서브 캔버스로 들어가고, 카드를 함에 끌어 넣어 정리하고, 브레드크럼으로 상위로 돌아오고 싶다 / 평면 보드만으로는 깊이가 생기지 않아 정리가 한 층에서 정체되기 때문.

## 2. 범위

### 포함 (in-scope)
- 사이드바 `board` 도구를 캔버스에 드롭 → "함" 카드 생성 + 그 즉시 연결된 빈 서브 보드 1개 생성.
- 함 카드 더블클릭 → 연결된 서브 보드로 진입 (보드 전환).
- 상단 브레드크럼: `루트 › 캔버스B › 캔버스C` — 각 조각 클릭으로 해당 상위 보드로 복귀. Esc로 한 단계 위로.
- 함 카드 외형: 폴더/함 아이콘(📦 또는 `board.png`) + 서브 보드 이름 + "카드 N개" 표시.
- 무한 중첩 가능 (함 안에 또 함).
- 캔버스의 기존 카드를 함 카드 위로 드래그&드롭 → 그 카드의 boardId가 서브 보드로 바뀌어 서브 캔버스로 이동.
- 모든 상태(부모-자식 관계, 함↔보드 연결, 카드 이동) IndexedDB 영속 + 새로고침 복원.

### 제외 (out-of-scope)
- **함 미리보기 자동 갱신/실시간 썸네일** — "카드 N개" 카운트만. 내부 미니 렌더는 후속.
- **AI 연결·검색의 중첩 인식** — 임베딩/연결 추천은 현재대로 보드 경계 무시 또는 평면 취급. 중첩 의미 반영은 후속. [[FEAT-ai-pipeline]]
- **함을 다른 함으로 드래그해 보드째 이동** — 카드 이동만. 보드 트리 재배치(이사)는 후속.
- **함/서브 보드 삭제 시 자식 캔버스 cascade 처리의 UX 정교화** — MVP는 단순 규칙(아래 AC-7) 적용.
- **사이드바 BoardPicker의 트리(들여쓰기) 표시** — 네비게이션은 브레드크럼으로. 사이드바 트리는 후속.

> **결정 변경(2026-05-29):** 당초 "시스템 보드에는 함 생성 불가"로 잡았으나, 시스템 보드("머무는 생각")가 앱의 기본 홈 화면이라 거기서 막으면 기능 자체를 발견하기 어렵다(첫 시도부터 막힘). → **어느 보드에서나 함 생성 허용**으로 변경. 시스템 보드에 만든 함 카드는 boardId=null로 저장되고, 그 서브 보드의 parentBoardId는 `"system"` sentinel로 둔다. 브레드크럼은 시스템 보드를 루트 크럼("머무는 생각 › …")으로 표시한다.

## 3. 수용 기준 (Acceptance Criteria)

### AC-1 — 함 생성
- **Given** 임의의 보드(시스템 보드 포함)를 보고 있을 때
- **When** 사이드바 `board` 도구를 캔버스 위 (x, y)에 드롭
- **Then** 그 위치에 `kind: "board"` 함 카드가 생기고, 동시에 `parentBoardId = 현재 보드 id`(시스템 보드면 `"system"`)인 빈 서브 보드가 생성되며, 함 카드의 `boardRef`가 그 서브 보드 id를 가리킨다. 함 카드는 편집 모드로 들어가지 않는다(텍스트 입력 카드가 아님).

### AC-2 — 진입
- **Given** 함 카드가 있는 보드
- **When** 함 카드를 더블클릭
- **Then** `boardRef`가 가리키는 서브 보드로 전환된다(기존 `setCurrentBoard` 경로 재사용 — 페이드 전환, viewport 복원).

### AC-3 — 브레드크럼 복귀
- **Given** 루트에서 두 단계 들어와 캔버스C를 보고 있을 때
- **When** 상단 브레드크럼에 `루트 › 캔버스B › 캔버스C`가 표시되고, "캔버스B" 조각을 클릭
- **Then** 캔버스B로 전환된다. 시스템 보드(루트가 시스템 보드인 경우)도 브레드크럼 첫 조각으로 표시·클릭 가능.

### AC-4 — Esc 한 단계 위로
- **Given** 서브 보드를 보고 있고, 카드 편집/모달/펜 모드가 아닐 때
- **When** Esc 키
- **Then** 부모 보드(`parentBoardId`)로 전환된다. 루트(부모 없음)에서는 no-op(기존 Esc 동작과 충돌하지 않음 — 선택 해제 등 기존 우선순위 유지).

### AC-5 — 함 외형 / 카운트
- **Given** 서브 보드에 카드 N개가 있을 때
- **When** 부모 보드에서 그 함 카드를 본다
- **Then** 함 아이콘 + 서브 보드 이름(빈 이름이면 "이름 없는 캔버스") + "카드 N개"가 표시된다. N은 진입 시점 기준으로 정확하다(실시간 구독은 비목표지만, 부모 보드 로드 시 카운트를 함께 조회).

### AC-6 — 드래그로 카드 넣기
- **Given** 보드에 일반 카드 X와 함 카드 H가 있을 때
- **When** 카드 X를 드래그해 함 카드 H 위에서 드롭(드롭 가능 상태 시 H가 하이라이트)
- **Then** 카드 X의 boardId가 H의 서브 보드로 바뀌어 현재 보드에서 사라지고, 다음에 H로 진입하면 X가 그 안에 있다. 함 카드를 함 카드 위로 드롭하는 것도 동일하게 동작(보드째 이동 아님 — 함 카드 자체가 자식으로 이동, 자식의 서브 보드 트리는 따라감).

### AC-7 — 삭제 규칙
- **Given** 자식 카드를 가진 서브 보드를 가리키는 함 카드
- **When** 함 카드를 삭제(Delete/Backspace)
- **Then** 함 카드 + 연결된 서브 보드 + 그 보드의 모든 카드(및 하위 함의 서브 보드들)가 재귀적으로 함께 삭제된다. 기존 보드 5초 undo([[FEAT-boards]] §8) 패턴을 따른다 — undo 시 함 카드·서브 보드·자식들 복원. **구현 노트:** cascade 시 DB row(board/note/connection/embedding)는 즉시 삭제하되 OPFS 첨부 blob은 보존하고, undo 만료(또는 ×) 시 `purgeAttachments`로 정리한다 — 만료 전 undo면 미디어 카드까지 복원되도록. 일반 카드는 단일 삭제와 동일하게 즉시 삭제(undo 없음).

### AC-8 — 영속·복원
- **Given** 함 생성 + 카드 이동 + 2단계 진입 후
- **When** 새로고침
- **Then** 부모-자식 관계, 함↔보드 연결, 이동된 카드 위치가 모두 복원되고 동일 경로로 재진입 가능.

## 4. 의존성

### 다른 feature
- **의존**: [[FEAT-boards]] — Board 모델·`setCurrentBoard`·보드 undo 패턴 재사용. [[FEAT-canvas]] — 카드 드래그·드롭·더블클릭 인터랙션.
- **의존받음**: 후속 AI 중첩 인식, 사이드바 트리.

### 외부 라이브러리·API
- 추가 없음. Dexie 스키마는 인덱스 추가(parentBoardId)만 — version(4) upgrade.

## 5. 데이터 모델

기존 모델 재사용 + 최소 필드 추가 (사용자 결정: "기존 Board 재사용 + 중첩").

```ts
// db/schema.ts
interface Board {
  id: string;
  name: string;
  isSystem: boolean;
  templateId?: string;
  parentBoardId?: string | null;  // 신규. 루트/시스템 보드는 null|undefined.
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

// 함 카드 = kind:"board" 카드. boardRef를 어디에 담을지:
//   Note에는 boardRef 전용 컬럼이 없으므로 content에 서브 보드 id를 저장한다.
//   (comment 카드가 author/time을 content JSON에 묻는 패턴과 동일.)
//   content = JSON.stringify({ __moss_subcanvas_v1__: true, boardRef: "b-..." })
```

- **NoteKind에 "board" 추가** (현재 NoteKind에는 없음 — CardKind ToolId에는 board가 있으나 capture kind 아님). storage 매핑에서 `board`를 신규 보존 kind로 추가.
- Dexie `notes` stores 인덱스는 그대로(kind 인덱스 이미 존재). `boards`에 `parentBoardId` 인덱스 추가 → version(4).

## 6. 인터페이스

### Store (Zustand) actions
- `createSubcanvas(x, y): string` — 빈 서브 보드 생성 + parentBoardId=현재 보드 + 함 카드(kind:"board", boardRef) 생성. 함 카드 id 반환.
- `enterSubcanvas(cardId): Promise<void>` — 함 카드의 boardRef 보드로 `setCurrentBoard`.
- `getBreadcrumb(): {id, name}[]` (selector) — currentBoardId에서 parentBoardId 체인을 거슬러 루트까지.
- `goToParent(): Promise<void>` — 현재 보드의 parentBoardId로 전환. 없으면 no-op.
- `moveCardToSubcanvas(cardId, targetFunnelCardId): Promise<void>` — cardId의 boardId를 함 카드의 서브 보드로 변경 + 현재 cards에서 제거.
- 함/서브보드 삭제는 기존 `remove`/`removeBoardWithUndo`를 재귀 cascade로 확장.

### React 컴포넌트
- `<Breadcrumb />` — Header 영역에 보드 경로 표시. 조각 클릭 → setCurrentBoard.
- 함 카드 렌더: `cards/` 디렉토리에 `BoardCard`(또는 기존 카드 렌더 분기에 board kind 추가). 더블클릭 핸들러.
- DraggableCard / Canvas의 드롭 로직에 "함 위 드롭" 판정 추가.

## 7. 시각·인터랙션

- 함 카드: `board.png`(이미 public/cards에 존재 가정 — 없으면 폴더 아이콘 폴백) + 이름 + "카드 N개". 다른 카드와 톤 일치(포스트잇/종이 질감 유지, 디자인 토큰 사용 — shadcn 금지).
- 브레드크럼: Header 좌측. 조각 사이 `›` 구분. 현재 보드 조각은 비활성(클릭 불가) 스타일.
- 드롭 하이라이트: 카드를 끌 때 함 카드 위에 올라가면 함 카드 테두리/배경 강조(Milanote 보드 드롭 톤 참조, cool/blue 톤 미채택).
- 더블클릭 진입 시 기존 보드 전환 페이드(200ms) 재사용.

## 8. 비기능 요구사항

- **성능**: 진입 전환은 기존 `setCurrentBoard`와 동일(추가 비용 없음). 함 카드 카운트는 부모 보드 로드 시 boardId별 count 1회 — N+1 쿼리 피하기 위해 한 번에 집계.
- **데이터 무결성**: 함 카드 삭제 시 고아 보드/순환 참조 방지. parentBoardId 체인에 사이클 생기지 않도록 보장(드래그 이동 시 자기 조상으로의 이동 금지).
- **i18n**: "이름 없는 캔버스", "카드 N개", 브레드크럼 루트 라벨은 i18n 키.
- **프라이버시**: 데이터는 전부 로컬. 변화 없음.

## 9. 다음 iteration (의도적 보류)

- 함 카드 내부 실시간 미니 썸네일.
- 사이드바 BoardPicker 트리(들여쓰기) 표시.
- AI 연결·검색의 중첩 경계 인식.
- 함을 함으로 끌어 보드 트리 재배치(이사).

## 10. 검증 방법 (DOD)

- [ ] 단위 테스트: createSubcanvas / enterSubcanvas / getBreadcrumb / goToParent / moveCardToSubcanvas / cascade 삭제 + undo / 사이클 방지.
- [ ] Dexie version(4) upgrade 무손실 (기존 보드 parentBoardId=null로 보존).
- [ ] 수동 시나리오: 함 만들기 → 진입 → 카드 드롭 → 브레드크럼 복귀 → 새로고침 복원.
- [ ] 무한 중첩 3단계 왕복.
- [ ] 기존 boards/canvas 테스트 그린 유지.
