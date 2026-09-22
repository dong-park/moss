# FEAT-trash · 휴지통

> 지운 메모가 바로 사라지지 않는다. 독 끝의 휴지통에서 다시 꺼내거나, 마음이 정해지면 영구히 버린다.

**Status**: spec 작성
**Owner**: dong-park
**Estimated**: M
**Blueprint**: (신규 — 블루프린트 미등록, 추후 features[id="FEAT-trash"] 추가)

---

## 1. 목표 (Job Statement)

메모를 지운 사용자가 / 잘못 지웠거나 다시 필요해졌을 때 / 휴지통을 열어 그 메모를 원래 자리로 되돌리고 싶다 / 지금은 Delete 한 번에 메모가 영구 삭제되어 되돌릴 길이 없기 때문.

## 2. 범위

### 포함 (in-scope)
- 메모 삭제는 전부 휴지통으로 간다. 캔버스의 Delete, 선택 삭제, 브리지 삭제 모두 같은 경로다.
- 휴지통은 보드와 상관없이 하나다. 지운 메모 전체를 한 목록으로 본다.
- 독 맨 끝에 휴지통 버튼이 있다. 누르면 지운 메모 목록 패널이 열린다.
- 목록의 메모마다 제목 또는 본문 첫 줄, 원래 보드 이름, 지운 시각을 보여준다.
- 메모마다 **복구**와 **영구 삭제** 버튼이 있다. 패널 위에는 **비우기** 버튼이 있다.
- 복구하면 원래 보드의 원래 좌표로 돌아간다. 원래 보드가 없으면 지금 보는 보드의 화면 가운데로 간다.
- 복구하면 양 끝 메모가 살아 있는 연결선도 함께 돌아온다.
- 자동 삭제는 없다. 사용자가 비우거나 개별 영구 삭제할 때까지 남는다.
- 휴지통 내용은 IndexedDB에 남고 새로고침 뒤에도 유지된다.

### 제외 (out-of-scope)
- **판 삭제와 함 cascade 삭제** — 지금 동작 그대로 둔다. 판은 즉시 삭제, 함은 5초 undo다. [[FEAT-sticky-redesign]] [[FEAT-subcanvas]]
- **휴지통 버튼 위로 드래그해서 버리기** — 삭제 입력은 기존 Delete 키와 메뉴만.
- **자동 비우기** — 30일 뒤 삭제 같은 규칙은 넣지 않는다.
- **휴지통 안 메모 검색·정렬 옵션** — 지운 시각 최신순 하나로 고정.
- **브리지에서 휴지통 목록·복구 명령** — 브리지는 삭제만 휴지통 경로를 탄다. 조회와 복구는 후속.
- **첨부 blob 이동** — 첨부는 OPFS에 그대로 두고 영구 삭제 때만 지운다.

## 3. 수용 기준 (Acceptance Criteria)

### AC-1 — 삭제는 휴지통행
- **Given** 캔버스에 메모 한 장이 있을 때
- **When** 메모를 선택하고 Delete를 누른다
- **Then** 메모가 캔버스에서 사라지고 휴지통 목록 맨 위에 나타난다. 임베딩은 지우고 연결선은 휴지통 행에 스냅샷으로 저장한다. `notes` 테이블에서는 행이 사라진다.

### AC-2 — 여러 장 삭제
- **Given** 메모 3장과 함 카드 1장을 함께 선택했을 때
- **When** Delete를 누른다
- **Then** 메모 3장은 휴지통으로 간다. 함 카드는 지금처럼 cascade 삭제와 5초 undo를 탄다.

### AC-3 — 브리지 삭제
- **Given** 브리지 `notes.delete`를 메모 id로 부를 때
- **When** 명령이 실행된다
- **Then** 현재 보드 카드든 다른 보드 메모든 휴지통으로 간다. 응답 형식은 지금과 같다.

### AC-4 — 독 버튼과 패널
- **Given** 어느 보드든 보고 있을 때
- **When** 독 맨 끝의 휴지통 버튼을 누른다
- **Then** 패널이 열리고 지운 메모가 최신순으로 보인다. 각 행에 제목 또는 본문 첫 줄 40자, 원래 보드 이름, 지운 시각이 있다. 원래 보드가 없으면 보드 이름 자리에 "삭제된 보드"라고 쓴다. 비어 있으면 "휴지통이 비어 있어요"를 보여준다. 휴지통 버튼은 드래그할 수 없다.

### AC-5 — 복구, 원래 보드가 있을 때
- **Given** 보드 B의 (300, 200)에 있던 메모를 지웠고 B가 아직 있을 때
- **When** 휴지통에서 복구를 누른다
- **Then** 메모가 B의 (300, 200)으로 돌아간다. id, 내용, 색, 크기, 제목, 첨부, 손글씨 레이어가 그대로다. 사용자가 B를 보고 있으면 캔버스에 바로 보인다. 다른 보드를 보고 있으면 B로 이동하지 않고 그 자리에 머문다.

### AC-6 — 복구, 원래 보드가 없을 때
- **Given** 원래 보드가 지워진 메모가 휴지통에 있을 때
- **When** 복구를 누른다
- **Then** 메모가 지금 보는 보드의 화면 가운데에 놓인다. frameId는 비운다.

### AC-7 — 복구 시 판 소속
- **Given** 판 F 안에 있던 메모를 지웠을 때
- **When** 복구한다
- **Then** F가 같은 보드에 아직 있으면 frameId를 유지한다. F가 없으면 frameId를 비운다.

### AC-8 — 복구 시 연결선
- **Given** 메모 A가 B, C와 연결되어 있었고 A를 지운 뒤 C도 지웠을 때
- **When** A를 복구한다
- **Then** A–B 연결선만 돌아온다. A–C는 C가 없으므로 만들지 않는다. 그 뒤 C를 복구해도 A–C는 돌아온다. C의 스냅샷에 A–C가 있고 A가 살아 있기 때문이다.

### AC-9 — 개별 영구 삭제
- **Given** 휴지통에 첨부 있는 이미지 메모가 있을 때
- **When** 그 행의 영구 삭제를 누른다
- **Then** 확인 없이 휴지통 행과 OPFS 첨부 blob을 지운다. 되돌릴 수 없다.

### AC-10 — 비우기
- **Given** 휴지통에 메모 N장이 있을 때
- **When** 비우기를 누른다
- **Then** "메모 N개를 영구 삭제할까요?" 확인 다이얼로그가 뜬다. 확인하면 N장 전부와 첨부를 지운다. 취소하면 아무 일도 없다. 확인은 브라우저 `confirm`으로 충분하다.

### AC-11 — 영속
- **Given** 메모 2장을 지우고 1장을 복구한 뒤
- **When** 새로고침한다
- **Then** 휴지통에 1장이 남아 있고, 복구한 1장은 보드에 있다.

### AC-12 — 기존 조회 경로 무영향
- **Given** 휴지통에 메모가 있을 때
- **When** 보드 로드, 시그널, AI 추천, 내보내기, 함 카드 카운트를 실행한다
- **Then** 휴지통 메모는 어디에도 나오지 않는다. 별도 테이블이라 기존 쿼리를 고치지 않아도 성립한다.

## 4. 의존성

### 다른 feature
- **의존**: [[FEAT-canvas]] — 삭제 입력과 `remove`/`removeSelected` 액션. [[FEAT-subcanvas]] — 함 cascade는 그대로 두고 메모만 분기한다. [[FEAT-memo-title]] — 목록 행 제목 표시.
- **의존받음**: 없음.

### 외부 라이브러리·API
- 추가 없음. Dexie 스키마 version(6)에 `trash` 테이블 하나 추가.

## 5. 데이터 모델

소프트 삭제 대신 **별도 테이블**을 쓴다. `notes`에 deletedAt을 두면 조회 경로 10곳을 전부 고쳐야 하고 하나만 빠져도 지운 메모가 새어 나온다. 별도 테이블이면 기존 경로는 손대지 않는다.

```ts
// db/schema.ts — version(6)
interface TrashEntry {
  id: string;             // 원래 note.id 그대로. 복구 시 id 보존.
  note: Note;             // 지울 때의 행 전체 스냅샷. boardId·frameId·x·y 포함.
  connections: Connection[]; // 지울 때 이 메모에 붙어 있던 연결선 전체.
  boardName: string | null;  // 지울 때의 보드 이름. 보드가 사라져도 목록에 이름을 남긴다.
  deletedAt: number;
}
// stores: trash: "id, deletedAt"
```

- 임베딩은 저장하지 않는다. 복구 뒤 기존 AI 파이프라인이 다시 만든다.
- 첨부 blob은 OPFS에 그대로 둔다. 영구 삭제와 비우기에서만 `deleteBlob`을 부른다.
- 같은 id가 이미 휴지통에 있으면 덮어쓴다. 복구 없이 같은 id가 두 번 지워질 일은 없다.

## 6. 인터페이스

### storage
- `trashNote(id): Promise<void>` — 한 트랜잭션에서 notes·connections·embeddings에서 지우고 `trash`에 스냅샷을 넣는다. 기존 `removeNote`의 blob 삭제만 뺀 형태다.
- `listTrash(): Promise<TrashEntry[]>` — deletedAt 내림차순.
- `restoreNote(id, fallback: {boardId, x, y}): Promise<Note>` — 보드 존재 여부로 위치를 정하고, 판 존재 여부로 frameId를 정하고, 양 끝이 살아 있는 연결선만 다시 넣는다. 복구한 Note를 돌려준다.
- `purgeTrash(ids?: string[]): Promise<void>` — 생략하면 전체. 행과 blob을 지운다.
- 기존 `removeNote`는 영구 삭제 전용으로 남긴다. 호출자는 브리지로 다른 보드의 판을 지울 때 하나다. 캔버스의 판 삭제와 함 cascade는 `db.notes.delete`를 직접 쓴다.

### Store (Zustand) actions
- `remove(id)` / `removeSelected()` — 메모 분기를 `storage.removeNote`에서 `storage.trashNote`로 바꾼다. 판·함 분기는 그대로.
- `restoreFromTrash(id): Promise<void>` — fallback으로 현재 보드와 뷰포트 중심을 넘긴다. 복구된 메모의 boardId가 현재 보드면 `cards`에 넣는다.
- `trashOpen: boolean`, `setTrashOpen(v)` — 패널 열림 상태.

### React 컴포넌트
- `<TrashPanel />` — 독 옆 패널. 목록·복구·영구 삭제·비우기. 열릴 때 `listTrash`를 부르고, 복구·삭제 뒤 다시 부른다.
- `Dock.tsx` 항목 배열 끝에 `{toolId: "trash", draggable: false}`를 추가한다. ToolId "trash"와 i18n 키 `workspace.tool.trash`는 이미 있다.

### 브리지
- `notes.delete` — 현재 보드 카드든 아니든 `trashNote` 경로를 탄다.

## 7. 시각·인터랙션

- 휴지통 버튼은 독의 다른 도구와 같은 크기·톤이다. 휴지통에 메모가 있으면 작은 점 배지를 단다.
- 패널은 독 위로 뜨는 카드다. 폭 320px, 높이는 뷰포트의 60%까지 스크롤. 바깥 클릭과 Esc로 닫힌다.
- 행 하나: 첫 줄 제목 또는 본문 40자, 둘째 줄 보드 이름과 지운 시각. 오른쪽에 복구·영구 삭제 아이콘 버튼.
- 복구하면 행이 목록에서 사라진다. 현재 보드로 돌아온 메모는 기존 카드 등장 애니메이션을 탄다.
- 별도 undo 토스트는 없다. 휴지통 자체가 되돌리기다.

## 8. 비기능 요구사항

- **성능**: 삭제 한 번은 트랜잭션 1개. 목록 열기는 휴지통 1,000건까지 200ms 안에 그린다.
- **접근성**: 패널은 `role="dialog"`, 버튼은 aria-label, Tab으로 행 사이 이동, Esc로 닫기.
- **데이터 무결성**: 복구는 한 트랜잭션에서 notes 삽입·connections 삽입·trash 삭제를 한다. 중간 실패 시 휴지통에 남는다.
- **프라이버시**: 전부 로컬. 변화 없음.
- **i18n**: 패널 제목, 빈 상태 문구, 버튼 라벨, "삭제된 보드", 확인 문구는 i18n 키.

## 9. 다음 iteration (의도적 보류)

- 휴지통 버튼 위로 카드 드래그해서 버리기.
- 브리지 `trash.list` / `trash.restore`.
- 휴지통 안 검색과 보드별 필터. 건수가 늘면 넣는다.
- 30일 자동 비우기. 사용자가 요청하면 넣는다.
- 판 삭제 시 안에 있던 메모를 휴지통으로 보내기. 지금은 판 삭제 규칙을 건드리지 않는다.

## 10. 검증 방법 (DOD)

- [ ] 단위 테스트: trashNote / listTrash / restoreNote 보드 있음·없음·판 있음·없음·연결선 부분 복구 / purgeTrash 개별·전체.
- [ ] Dexie version(6) upgrade 무손실. 기존 notes·connections 그대로.
- [ ] workspace 테스트: remove·removeSelected가 메모는 휴지통으로, 함은 cascade로 보낸다.
- [ ] mossBridge 테스트: notes.delete가 휴지통 경로를 탄다.
- [ ] 수동 시나리오: 메모 삭제 → 다른 보드로 이동 → 휴지통에서 복구 → 원래 보드로 가서 확인 → 새로고침.
- [ ] 수동 시나리오: 보드 삭제 → 그 보드 메모 복구 → 현재 보드 가운데에 등장.
- [ ] 기존 canvas/subcanvas/export 테스트 그린 유지.

## 구현 메모

- 삭제 진입점: `web/src/state/workspace.ts` `remove`(~1761)와 `removeSelected`(~1790, 메모 분기 ~1822). 판은 deleteFrame, 함은 `cascadeDeleteFunnels`(984)로 가는 분기는 그대로.
- 기존 하드 삭제: `web/src/state/storage.ts` `removeNote`(197). trashNote는 이 함수에서 `deleteBlob` 호출을 빼고 `trash.put`을 더한 형태.
- 스키마: `web/src/state/db/schema.ts` version(5)가 최신. version(6)에 `trash: "id, deletedAt"` 추가. Note 타입은 그대로.
- 기존 notes 조회 경로는 손대지 않는다: storage.ts loadNotes(182)·카운트(248)·cascade(286), useSignals.ts(35), useAIPipeline.ts(110·137·176), collectExportData.ts(33·39), mossBundleImport.ts(170).
- 브리지: `web/src/state/bridge/mossBridge.ts` `notes.delete`(345). 두 분기 모두 휴지통 경로로.
- 독: `web/src/components/workspace/Dock.tsx` 항목 배열(59-63). 토스트 참고 패턴 `BoardUndoToast.tsx`는 이번엔 안 쓴다.
- 작업 위치: worktree `/Users/donghwan/poc-trash` 브랜치 `feat/trash`. base는 `feat/memo-front-title`(8da035e, main 미머지). 원 작업트리 `/Users/donghwan/poc`에는 '메모 정사각형' 미커밋 작업이 있어 분리했다. 원 트리는 건드리지 않는다.
- node_modules는 worktree에 없다. `moss/web`에서 `bun install` 먼저. 테스트는 `npx vitest run`.
- 메모 삭제 경로는 3곳뿐임을 grep으로 확인했다: workspace.ts 1785·1822, mossBridge.ts 354. db.notes.delete 나머지 3곳(storage 210·303, workspace 1004·1574)은 removeNote 본체·함·판 경로.
- 뒤집힌 결정: 처음엔 notes에 deletedAt 소프트 삭제를 검토했다. 조회 경로 10곳 수정이 필요해 별도 trash 테이블로 바꿨다.

---

## Plan: 휴지통

## 사람용 요약

**한 줄로**: 메모를 지우면 바로 없애지 않고 휴지통 창고로 옮긴 뒤, 독 버튼에서 꺼내 쓰게 한다.

1. **창고 만들기** — 지운 메모와 연결선을 통째로 보관할 칸을 만든다. 넣기, 목록, 되돌리기, 영구 삭제 네 동작을 테스트로 먼저 굳힌다.
2. **삭제를 창고로 돌리기** ← 요청하신 "지운 메모가 사라지지 않게"가 여기서 해결된다. 캔버스 Delete, 여러 장 삭제, 브리지 삭제 3곳이 영구 삭제 대신 창고로 보낸다. 판과 함은 지금 그대로다.
3. **휴지통 버튼과 패널** — 독 끝에 버튼을 달고, 목록에서 복구·영구 삭제·비우기를 누를 수 있게 한다.

진행: 1 → 2 → 3. 앞 단계 결과를 다음 단계가 써서 차례로 한다.

---

<!-- STEP:0:trash-storage:done -->
### T-0: trash 테이블과 storage 함수 4개

#### 읽을 파일
- `web/src/state/db/schema.ts` — Dexie 스키마. version(5)가 최신. notes 인덱스 "id, boardId, kind, createdAt, lastVisitedAt, aiOptOut"
- `web/src/state/storage.ts` — `removeNote`(197): 한 트랜잭션에서 connections(source/target) bulkDelete, embeddings.delete, notes.delete, 뒤에 attachmentRef blob 삭제

#### 작업
- schema version(6)에 `trash: "id, deletedAt"` 추가. `TrashEntry { id; note: Note; connections: Connection[]; boardName: string | null; deletedAt: number }` 타입 정의.
- storage에 추가:
  - `trashNote(id)` — 한 트랜잭션: 연결선·보드 이름 스냅샷 → trash.put → notes·connections·embeddings 삭제. blob은 지우지 않는다.
  - `listTrash()` — deletedAt 내림차순.
  - `restoreNote(id, fallback: {boardId, x, y}): Promise<Note>` — 원래 보드가 있으면 원래 좌표, 없으면 fallback 좌표·boardId에 frameId 비움. 판이 같은 보드에 없으면 frameId 비움. 양 끝이 notes에 있는 연결선만 삽입. notes 삽입·connections 삽입·trash 삭제를 한 트랜잭션으로.
  - `purgeTrash(ids?)` — 생략하면 전체. 행 삭제 후 첨부 blob 삭제.
- `removeNote`는 그대로 둔다.
- 단위 테스트 `web/src/state/__tests__/trash.test.ts`: spec AC-1, AC-5~AC-11의 storage 부분. AC-8 연결선 부분 복구 시나리오 포함.

#### AC
```bash
cd web && npx vitest run src/state/__tests__/trash.test.ts
cd web && npx vitest run   # 기존 테스트 그린 유지, v6 upgrade 무손실
```

#### 금지사항
- notes에 deletedAt 필드를 두지 마라. 이유: 조회 경로 10곳이 새어 나온다. 별도 테이블로 결정됐다.
- 임베딩을 trash에 저장하지 마라. 이유: 복구 뒤 AI 파이프라인이 다시 만든다.
- 작업트리의 무관한 미커밋 변경을 되돌리거나 커밋에 섞지 마라. 이유: 다른 작업이다.

- summary: schema v6에 trash 테이블 추가(기존 5테이블 무손실), storage에 trashNote/listTrash/restoreNote/purgeTrash 4함수 구현. trash.test.ts 10개 통과(AC-1·5~11 + v6 upgrade 무손실). AC-8을 위해 trashNote가 기존 휴지통 스냅샷의 연결선도 함께 담는다.
<!-- /STEP -->

<!-- STEP:1:trash-wiring:done -->
### T-1: 메모 삭제 3경로를 휴지통으로, 복구 액션 추가

#### 읽을 파일
- `web/src/state/workspace.ts` — `remove`(~1761) 메모 분기 `storage.removeNote(id)`(1785). `removeSelected` 메모 분기(1822). 판은 deleteFrame, 함은 cascadeDeleteFunnels(984) — 그대로 둔다.
- `web/src/state/bridge/mossBridge.ts` — `notes.delete`(345): 현재 보드 카드면 ws.remove, 아니면 removeNote(354)
- `web/src/state/storage.ts` — T-0이 추가한 trashNote/restoreNote

#### 작업
- 1785·1822·bridge 354의 `removeNote`를 `trashNote`로 바꾼다. 메모 삭제 경로는 이 3곳뿐이다. grep으로 확인했다.
- store에 `trashOpen: boolean`, `setTrashOpen(v)`, `restoreFromTrash(id)` 추가. restoreFromTrash는 fallback으로 현재 보드와 뷰포트 중심을 넘기고, 복구된 Note의 boardId가 현재 보드면 cards에 넣는다.
- 테스트: `workspace.test.ts`에 remove·removeSelected가 메모는 trash로, 함은 cascade로 가는 케이스. `mossBridge.test.ts`에 notes.delete 두 분기가 trash로 가는 케이스. restoreFromTrash가 현재 보드면 cards에 추가, 아니면 cards 불변.

#### AC
```bash
cd web && npx vitest run src/state/__tests__/workspace.test.ts src/state/bridge/__tests__/mossBridge.test.ts
cd web && npx vitest run
```

#### 금지사항
- 판 삭제(1574)·함 cascade(1004, storage 303) 경로를 바꾸지 마라. 이유: spec 범위 밖이다.
- undo 토스트를 만들지 마라. 이유: 휴지통이 되돌리기다.
- workspace.ts·두 테스트 파일의 기존 미커밋 변경을 덮어쓰지 마라. 이유: 다른 작업이 진행 중이다.

- summary: workspace remove/removeSelected 메모 분기와 mossBridge notes.delete를 trashNote로 전환(판·함 cascade 유지). store에 trashOpen/trashCount/setTrashOpen/refreshTrashCount/restoreFromTrash 추가. workspace.test.ts 6개·mossBridge.test.ts 2개 통과.
<!-- /STEP -->

<!-- STEP:2:trash-ui:done -->
### T-2: 독 휴지통 버튼과 TrashPanel

#### 읽을 파일
- `web/src/components/workspace/Dock.tsx` — 항목 배열(59-63) `{toolId, icon, labelKey, draggable}`. 클릭 분기(315~)
- `web/src/i18n/messages/ko.json` — `workspace.tool.trash` = "휴지통" 이미 있음(151)
- `web/src/components/workspace/Canvas.tsx` — 오버레이 레이어 마운트 위치. `<MemoSearchLayer />`(614)

#### 작업
- Dock 배열 끝에 `{toolId: "trash", draggable: false}`. 클릭하면 `setTrashOpen(true)`. 휴지통에 메모가 있으면 점 배지.
- `TrashPanel.tsx`: spec §7 모양. 열릴 때와 복구·삭제 뒤 `listTrash` 재조회. 행마다 제목 또는 본문 40자, 보드 이름 또는 "삭제된 보드", 지운 시각. 복구·영구 삭제 버튼. 상단 비우기는 `confirm("메모 N개를 영구 삭제할까요?")`. 빈 상태 "휴지통이 비어 있어요". `role="dialog"`, aria-label, Esc·바깥 클릭으로 닫기.
- 문구는 전부 i18n 키. ko와 다른 로캘 파일에 같이 추가.

#### AC
```bash
cd web && npx vitest run
cd web && npx eslint src/components/workspace/TrashPanel.tsx src/components/workspace/Dock.tsx
```
수동 시나리오 2개 (spec §10):
1. 메모 삭제 → 다른 보드로 이동 → 휴지통에서 복구 → 원래 보드로 가서 원래 자리 확인 → 새로고침 뒤 유지.
2. 보드 삭제 → 그 보드 메모 복구 → 현재 보드 화면 가운데에 등장.

#### 금지사항
- 휴지통 버튼을 드래그 가능하게 하지 마라. 이유: 드래그해서 버리기는 다음 iteration이다.
- 검색·정렬 옵션을 넣지 마라. 이유: 최신순 하나로 고정됐다.

- summary: Dock 끝에 휴지통 버튼(드래그 불가, 점 배지) 추가, Canvas에 TrashPanel 마운트. 패널은 최신순 목록·복구·영구 삭제·비우기(confirm)·빈 상태·Esc/바깥 클릭 닫기, role=dialog. 문구 전부 i18n(ko). Dock.test 3개·TrashPanel.test 6개 추가, eslint·tsc·i18n 통과.
<!-- /STEP -->
- 뒤집힌 결정: trashNote가 휴지통 전체를 읽어 반대편 스냅샷의 연결선을 모았다. 리뷰에서 삭제마다 O(휴지통 크기)이고 연달아 지우면 연결선이 사라지는 경쟁이 나왔다. 지금은 삭제 때 살아 있는 연결선만 트랜잭션 안에서 담고, 복구 때 반대편이 휴지통에 있으면 그 스냅샷으로 넘긴다.
