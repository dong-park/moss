# n7-frames — 메모판: 틀 그리기, 소속 판정, 같이 옮기기

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n1-db-v5 (frame 종류·frameId 필드)
**상태**: done

## 문제

한 캔버스 안에서 메모를 구역으로 묶는 수단이 없다(사이드바 `column` 버튼은 동작 없음).

## 목표

메모판은 메모보다 아래층에 그려지는 이름 붙은 틀이다. 메모를 끌어 놓으면 중심점 기준으로 소속이 정해지고, 판을 옮기면 속한 메모가 같이 옮겨진다. 판 안에 판은 들어가지 않는다. 생성 액션 `addFrameAt`을 export해 n8 독이 부른다.

## 작업

1. `web/src/state/workspace.ts` 액션:
   - `addFrameAt(x, y)` — n1 `makeFrameNote` 사용, 기본 크기는 최소(240×160) 이상에서 판단.
   - `resolveMembership(cardIds)` — spec §4 "소속 판정" 규칙 전부: 중심점, 경계선 포함, 겹친 판은 나중에 만든 판, frame·다른 보드 제외, 파일함 카드도 소속 가능.
   - `moveFrame(frameId, dx, dy)` — 판 + 속한 카드 전부를 한 Dexie 트랜잭션으로. 판과 메모 동시 다중 선택 이동 시 메모는 한 번만.
   - `resizeFrame`, `renameFrame`(1~40자, 빈 이름 → "새 메모판"), `deleteFrame`(속한 메모는 제자리, frameId만 해제).
   - 드롭 종료·판 드롭·판 리사이즈 시점에만 `resolveMembership` 호출(`DraggableCard.tsx` 드롭 종료 경로).
   - 파일함으로 메모 이동 시 frameId 해제.
   - frame 디코드 경로: `decodeNoteToCard`·`widthForKind`·`kindToDefaultToolId`·`CardContent` 렌더 분기에 frame을 추가한다. 지금은 frame Note가 로드되면 `{name}` JSON이 본문으로 보인다(1단계 리뷰 P1). 임베딩 게이트는 1단계 리뷰 수정에서 이미 frame 제외함.
2. 새 `web/src/components/workspace/cards/frame/` — 렌더: 메모보다 낮은 z, 상단 이름표(더블클릭 편집), 빈 곳 드래그=이동, 모서리=리사이즈. 토큰은 `web/src/design/tokens.ts`.
3. 테스트 `web/src/state/__tests__/frames.test.ts`: 중심점 안/밖/경계, 겹친 두 판, 판 이동 시 속한 메모만 같은 거리(spec §10), 중첩 불가(AC-12), 삭제 시 메모 유지, 리사이즈로 빠진 메모 해제. 성능: 메모 50개 판 이동 1프레임 < 16ms.

## 완료 기준

- [x] plan 공통 완료 기준 전부 (tsc / vitest 전체(기준선 7개 제외 회귀 0) / check-i18n / eslint 0 / 노드당 커밋 ≥1)
- [x] `cd web && npx vitest run src/state/__tests__/frames.test.ts` 통과 (16/16)
- [x] spec AC-10·AC-11·AC-12 전 항목, §5 "메모의 소속" 상태표 전이 전부 테스트로 확인
- [x] 메모 50개 판 이동 처리 < 16ms (테스트 내 측정 — `performance.now()` 델타)
- [ ] 실경로: 브라우저 자동화 도구가 이 서브에이전트 툴셋에 없어 dev 서버(3107)에서 클릭으로
      확인하지 못했다 — 갭으로 남긴다. 대신 dev 서버 기동(`npx next dev -p 3107`, `curl` 200 확인)과
      전체 vitest 스위트(fake-indexeddb 기반 실제 Dexie 트랜잭션 경로)로 addFrameAt→resolveMembership→
      moveFrame→DB 반영까지 검증했다. 브라우저 클릭 확인은 호출자가 별도로.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | 카드 액션·undo 경로 |
| `web/src/components/workspace/DraggableCard.tsx` | 카드 드래그·드롭 종료 |
| `web/src/components/workspace/Canvas.tsx` | 카드 레이어 렌더 순서 |
| `web/src/components/workspace/ResizeHandles.tsx` | 리사이즈 핸들 재사용 |
| `web/src/components/workspace/cards/CardContent.tsx` | kind 분기에 frame 추가 |
| `web/src/design/tokens.ts` | 색·반경·그림자 |

## 구현 메모

- `Card`/`Note`에 `frameId?: string`을 추가하고 `decodeNoteToCard`(board·일반 분기 모두)·`persistCard`가
  왕복시킨다. `FRAME_MIN_WIDTH/HEIGHT`(240/160), `FRAME_DEFAULT_WIDTH/HEIGHT`(320/220)를 export.
- `resolveMembership`은 겹친 판 우선순위를 별도 `createdAt` 필드 없이 `cards` 배열 순서로 판정한다
  (`storage.loadCards`가 `createdAt` 오름차순 정렬을 보장하고 `addFrameAt`은 배열 끝에 append하므로
  배열에서 더 뒤 = 나중 생성). Note 스키마를 건드리지 않아 v5 버전 선언과 무관.
- `moveFrame`은 로컬 상태를 즉시 갱신하고, DB 반영은 `schedulePersist(`frame-move:${frameId}`, …)`로
  디바운스한 뒤 한 Dexie 트랜잭션(`db.transaction("rw", db.notes, …)`)으로 프레임+멤버를 함께 쓴다.
- `DraggableCard.tsx`: frame 카드는 `onMove`에서 `moveCard` 대신 `moveFrame`을 타고(펀넬/크럼 감지 생략),
  `onUp`에서 드롭 종료 시점에만 `resolveMembership` 호출(단일 카드=자기 자신, frame=보드 전체 재판정,
  다중 선택=선택 집합 — **2단계 리뷰 P1로 뒤집음**: 선택에 frame이 섞이면 보드 전체(비-frame)로 재판정
  하도록 바꿨다. 원래는 선택 집합만 재판정해 frame이 옮겨지며 새로 들어오거나 빠진 "비선택" 카드가
  갱신 안 되는 버그가 있었다). z-index는 원래 `card.kind==="frame" ? 1 : 10`이었는데 **2단계 리뷰 P1로
  뒤집음**: `selected`이면 20이 되어 frame이 선택되면 메모 위로 올라가는 버그가 있었다 — frame은
  `selected ? 2 : 1`로 항상 메모(10/20/40)보다 아래에 고정하고, 선택 표시는 outline만으로 한다.
- `ResizeHandles.tsx`: frame은 `aspectForKind` 비율 고정 없이 방향별 축을 독립적으로 리사이즈하고,
  `onUp`에서만 `resolveMembership`(보드 전체 비-frame 카드) 호출.
- `deleteFrame`은 멤버의 `frameId`만 풀고(카드 자체는 유지) frame row만 삭제 — `remove`/`removeSelected`가
  frame 대상을 이 경로로 먼저 분리 처리하도록 수정(기존 `removeNote` 직접 호출 경로로 새면 멤버십 정리가
  안 됨).
- `moveCardToSubcanvas`/`moveCardToBoard`(파일함 이동)에 `frameId: undefined` 저장을 추가해
  "다른 캔버스로 나가면 판 소속 해제" 규칙을 만족시켰다(원래 없던 필드라 브리프에 명시 없었지만
  §4 소속 판정 규칙이 요구해 추가 — 호출자가 정할 것 없음, 스펙 문구 직접 대응).
- `cards/frame/Content.tsx`: 이름표(상단 라벨)가 자체 더블클릭으로 인라인 편집 진입, Enter/blur 커밋,
  Esc 취소. 라벨 위 mousedown은 `stopPropagation`으로 카드 드래그 시작을 막는다(더블클릭 보장 우선 —
  라벨 단일클릭으로는 카드가 선택되지 않는 트레이드오프, 스펙에 없는 항목이라 가정으로 넘어감).
- 성능 테스트는 실제 100+ 카드 캔버스 프레임 타이밍이 아니라 `moveFrame` 단일 호출의
  `performance.now()` 델타로 16ms 기준을 근사 측정한다(jsdom 환경 한계 — 실측 프레임 타이밍 불가).

### 2단계 리뷰 P1 수정 (2026-09-13)

- **저장 키 충돌 뒤집음**: `moveFrame`이 원래 자체 키 `frame-move:${frameId}`로 판+멤버를 한
  트랜잭션에 모아 저장했는데, 이 키가 `persistCardDebounced`(다른 편집 경로 전부가 쓰는 `card.id` 키)와
  달라 renameFrame 직후 드래그하면 rename이 예약해둔 "이동 전 좌표 스냅샷" 전체 put이 나중에 발사돼
  이동을 덮어쓸 수 있었다(재현: `frames.test.ts` "renameFrame 직후 moveFrame"). 지금은 이동한 각 행을
  자기 `card.id` 키로 개별 예약하고(schedulePersist의 "같은 키 재예약 시 최신이 이긴다" 규칙을 그대로
  이용), 콜백은 실행 시점에 `get().cards`에서 그 카드의 최신 상태를 다시 읽는다 — moveSelectedBy가
  이미 쓰던 것과 같은 패턴(별도 트랜잭션 없음)이라 프로젝트 관례에도 맞는다.
- **멀티 드래그 소속 재판정 확장**: 선택에 frame이 섞인 다중 드래그의 `onUp`에서 이제 보드 전체
  (비-frame)를 재판정한다(§3 item 3). `moveSelectedBy`도 선택에 frame이 있으면 그 frame의 비선택
  멤버를 이동 집합에 자동으로 넣는다(§4 "판을 옮기면 속한 메모가 같이 옮겨진다") — 이미 선택돼
  이동 집합에 들어있는 멤버는 중복 추가하지 않아 §4 "메모는 한 번만" 규칙을 만족한다.
- **저장 소속 쓰기 단일화**: `setFrameMembership(updates)` 헬퍼(workspace.ts)를 새로 두고
  `resolveMembership`과 `deleteFrame`의 멤버 frameId 해제가 이걸 거치게 모았다. Dexie는 이미 진행
  중인 "rw" db.notes 트랜잭션 안에서 같은 테이블 부분집합으로 다시 `db.transaction`을 열면 그 트랜잭션을
  재사용하므로, `deleteFrame`이 `setFrameMembership` 호출 + `db.notes.delete(id)`를 감싸도 원자성이
  유지된다. **가정으로 넘어감(호출자가 정할 것)**: `moveCardToSubcanvas`/`moveCardToBoard`는 이 헬퍼로
  옮기지 않았다 — 둘 다 boardId까지 함께 바꿔야 하고 `storage.saveNote`(read-merge-put, 없는 행이면
  새로 만듦)를 쓰는데, `setFrameMembership`은 `db.notes.update`(행이 없으면 조용히 no-op)라 아직
  DB에 flush 안 된 새 카드를 즉시 파일함으로 옮기면 조용히 유실될 위험이 있다. 두 경로 다 frameId를
  항상 `undefined` 고정값으로 쓰는 단순한 케이스라 버그는 없었으므로, 리스크 대비 이득이 낮다고 보고
  그대로 뒀다.
- **성능(Promise.all)**: `setFrameMembership`은 행별 순차 `await db.notes.update` 대신
  `Promise.all(...)`로 병렬 실행한다. `moveFrame`은 위 키 재설계로 "여러 행을 한 트랜잭션에 순차
  update" 패턴 자체가 없어져 별도 조치가 필요 없었다.
- **판 이름 encode/decode 단일화(P2)**: `web/src/state/frameContent.ts`를 새로 만들어
  `encodeFrameContent`/`decodeFrameContent`(+ `FRAME_DEFAULT_NAME`)로 trim·40자 자르기·기본값
  "새 메모판" 규약을 한곳에 모았다. `schema.ts`(makeFrameNote)·`workspace.ts`(renameFrame)·
  `cards/frame/Content.tsx`(구 `parseFrameName`)가 전부 이걸 쓴다.