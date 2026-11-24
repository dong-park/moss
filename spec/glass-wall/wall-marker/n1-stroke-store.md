# n1-stroke-store — 벽 획 저장 모델과 포스트잇 획 형식 넓히기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-1
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: 없음
**상태**: 진행
**담당 행**: T11, T13, T15

## 문제

벽에 그은 획을 둘 저장 자리가 없어서, 마카와 다른 티켓 다섯 개가 모두 이 모델을 기다린다.

## 목표

벽 획은 획 하나가 한 행으로 로컬 DB와 공유 문서에 저장되고 왕복한다. 포스트잇 획 형식은 획마다 색·굵기 이름을 싣고, 옛 획도 그대로 읽힌다. 담당 행: T15의 읽기 부분, T13·T11의 저장 토대.

## 확정된 결정 (그대로 따른다)

- D1=A: 벽 획 1개 = 1행. 로컬 `strokes` 테이블 + 공유 문서 `strokes` Y.Map.
- D2=A: 포스트잇 획은 지금처럼 노트 `overlay`에 둔다. path마다 `color`·`width`를 더한다.
- D3=A + marker-feel D1=A: 색과 굵기는 이름으로 저장한다. 색 `black` `blue` `red` `green`, 굵기 `thin` `mid` `thick`. 화면 값은 `#1f2430` `#2457b8` `#d0453c` `#2f8a57`이고, 굵기 수치는 marker-feel이 조율한다. 여기서는 임시값 thin 2 · mid 4 · thick 8 보드 단위를 상수 한 곳에 둔다.
- D14=A: 굵기는 보드 단위다. 줌과 함께 커진다.
- 옛 overlay path에 색·굵기가 없으면 `black`·`thin`으로 읽는다.

## 작업

1. 마카 토큰 모듈을 만든다: 색 이름 4개, 굵기 이름 3개, 이름→화면 값 함수. 다른 노드가 모두 이걸 쓴다.
2. 벽 획 타입 `WallStroke`를 정의한다: `id`, `boardId`, `points`(보드 좌표 `{x,y}[]`), `color`, `width`, `createdAt`, `updatedAt`. 선택 칸 `frameId?`를 둔다 — 아래 「충돌 주의」 참고.
3. Dexie v7: `strokes: "id, boardId"` 테이블을 더한다. 기존 v6 stores를 펼쳐 쓰고 데이터 변환은 없다.
4. Yjs: `model.ts`에 `STROKES_MAP`과 `STROKE_KEYS`를 더하고, `writeThrough.ts`·`liveSync.ts`가 notes·connections처럼 왕복시킨다.
5. `workspace.ts`에 벽 획 상태와 액션을 더한다: `wallStrokes`, `addWallStroke`, `removeWallStrokes(ids)`, `replaceWallStrokes(removeIds, add[])`(지우개 쪼개기용), `moveWallStrokes(ids, dx, dy)`. 보드를 열 때 불러오고 저장은 기존 디바운스 영속 경로를 따른다.
6. 보드 삭제와 그 5초 되살리기, 휴지통 비우기 경로에 `strokes` 테이블을 끼운다.
7. `cardContent.ts`의 `HandwritingContent` path에 `color?`·`width?`를 더한다. `coercePaths`와 `serializeHandwriting`이 옛 형식과 새 형식을 모두 왕복한다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bunx vitest run src/state/db src/state/ydoc src/state/__tests__` 통과. 새 테스트 최소 4개: Dexie 왕복, Y.Map 왕복, 옛 overlay(색·굵기 없음)를 `black`·`thin`으로 읽기, 보드 삭제 시 그 보드 strokes 삭제와 되살리기
- [ ] 실경로: 스토어 액션 → Dexie → 새로 연 스토어에서 같은 획을 읽는 테스트가 있다

## 충돌 주의 — 호출자 확인 필요

marker-meets-sticky D4=B는 "메모판 위 획은 메모판 것"이고, 이 티켓 D12=A는 "메모판 위에서 시작한 획은 벽 획"이다. 둘 다 닫혀 있다. 이 노드는 `frameId?` 선택 칸만 둬서 어느 쪽이든 받을 수 있게 하고, 판정 규칙은 정하지 않는다.

## 이 노드를 기다리는 다른 티켓

marker-feel(색·굵기 이름), marker-meets-sticky(벽 획 저장소 스냅샷 비교 T6), wall-zoom(T5·T6), wall-scale(획 가상화), local-ownership(내보내기에 벽 획 싣기), wall-wipe-snapshot(사진에 벽 획 담기).

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | Dexie 스키마. 지금 v6 |
| `web/src/state/ydoc/model.ts` | Y.Doc 맵·키 목록 |
| `web/src/state/ydoc/writeThrough.ts` | 로컬 → 문서 쓰기 |
| `web/src/state/db/liveSync.ts` | 문서 → 로컬 반영 |
| `web/src/state/workspace.ts` | 스토어. 보드 삭제·되살리기 1842~1910행 근처 |
| `web/src/state/cardContent.ts` | 167~209행 손글씨 형식 |
| `web/src/state/marker/tokens.ts` | 새로 만든다 |

## 구현 메모

**만든 것** (2026-10-12, 브랜치 feat/glass-wall-marker)

- 토큰: `web/src/state/marker/tokens.ts` — 색 `black|blue|red|green`, 굵기 `thin|mid|thick`, 이름→값 표(`MARKER_COLOR_VALUE`, `MARKER_WIDTH_UNITS` 임시값 2·4·8 보드 단위), 모르는 이름은 `resolveMarker*`가 검정·가는 선으로 읽는다.
- 저장 모델: `WallStroke`(`schema.ts`) = `id, boardId, points, color, width, frameId?, createdAt, updatedAt`. Dexie v7 `strokes: "id, boardId"`(데이터 변환 없음).
- 문서: `model.ts`의 `STROKES_MAP`·`strokesMap`·`applyStrokeChanges({put, update, remove})`·`readStrokes`·`readStroke`. 점은 문서에서 JSON 문자열 한 필드다(원시값만 통과하는 `readFields` 규약, 점은 만든 뒤 통째 교체). `writeThrough.writeStrokeRecords`는 비활성 보드 문서용.
- 스토어: `wallStrokes`, `addWallStroke(input)→WallStroke|null`, `removeWallStrokes(ids)`, `replaceWallStrokes(removeIds, add[])→added`, `moveWallStrokes(ids, dx, dy)`. 화면 → 문서(즉시) → Dexie 미러(300ms 디바운스, `flushAll`에 같이 걸린다). 원격·다른 탭 변경은 `bindActiveDocReflection`의 `reflectStrokes`가 화면과 미러에 반영한다. 보드를 열 때 문서에서 읽고 미러를 맞춘다(`reconcileStrokeMirror`).
- 보드 삭제·되살리기: `removeBoard`·`removeBoardCascade`가 그 보드 strokes 행을 지우고, `PendingBoardUndo.strokes`·`PendingSubcanvasUndo.strokes`가 되돌린다. `purgeLocalBoardCopy`도 지운다.
- 포스트잇 획: `cardContent.ts`에 `HandwritingStroke{points,color,width}`, `coerceStrokes`·`parseStrokes`·`serializeStrokes`. 옛 형식(점 배열)과 새 형식(`{points,color,width}`)을 한 overlay에서 같이 읽는다. 검정·가는 선만 있는 overlay는 옛 형식과 바이트가 같다.
- 벽 획 수 훅: `wallEmpty.ts`의 `useWallStrokeCount()`가 `wallStrokes.length`를 읽는다 — 마카로만 쓴 벽에 빈 벽 힌트가 뜨지 않는다.
- 첫 벽 공유: `share/firstWall.ts`의 `FirstWallPlan.strokes`가 벽 획을 새 벽으로 옮기고 실패하면 첫 벽으로 되돌린다(브리프 작업 목록 밖이지만 저장 모델의 일부라 같이 했다 — 안 하면 첫 벽 공유가 벽 획을 첫 벽에 남긴다).

**다음 노드가 알아야 할 것**

- **n3**: `serializeHandwriting`은 점만 쓴다(옛 블록·레거시 카드용). 색·굵기가 있는 overlay를 쓰는 `DrawingLayer`는 반드시 `parseStrokes`/`serializeStrokes`로 바꿔야 한다 — 안 바꾸면 지우개 한 번에 색이 검정으로 돌아간다. 지금은 아무도 색을 쓰지 않아 드러나지 않는다. 쪼갠 조각은 원본 획의 색·굵기를 그대로 받아야 한다.
- **n2/n4**: 되돌리기 기록은 `addWallStroke`가 돌려주는 획(id 포함)과 `replaceWallStrokes`가 돌려주는 조각으로 만든다. 지우는 쪽은 `removeWallStrokes(ids)`, 되살리는 쪽은 `addWallStroke({id, ...})`(id를 주면 그 id로 만든다; 생성 시각은 새로 매겨져 쌓임 순서는 맨 위가 된다).
- **n4**: 옮기기는 `moveWallStrokes`가 문서에 `update`로 쓴다 — 그 사이 다른 사람이 지운 획은 되살리지 않는다(지운 쪽이 이긴다). 힌트 위치(`SystemBoardEmpty` bottom-24)를 트레이 위로 올리는 일은 아직 남아 있다.
- 생성 시각은 세션 안에서 항상 늘어난다(`nextStrokeStamp`) — 같은 밀리초에 만든 획도 그린 순서가 남는다.

**갭 — 호출자 확인**

- 저장 실패 알림: 기존 카드 저장 실패 문구 `workspace.memoEditor.blockMenu.saveFailed`("저장하지 못했어요.")를 토스트로 재사용했다. 벽 전용 문구·위치가 필요하면 n4에서 정한다. Dexie 미러 쓰기 실패만 잡는다 — y-indexeddb 쪽 쓰기 실패는 기존 카드와 같이 잡히지 않는다.
- 내보내기·가져오기: `.moss` 내보내기는 벽 획을 싣지 않는다(local-ownership 몫). 덮어쓰기 가져오기(`clearBoardRecords`)는 벽 획을 **지우지 않는다** — 파일에 없는 획을 말없이 날리지 않으려는 선택이다. 덮어쓴 보드에 옛 벽 획이 남는다.
- 보드를 지운 뒤 그 보드 문서의 `strokes` 맵은 남는다(메모 문서와 같은 규약; 되살리면 그대로 보인다).
- `frameId?`는 칸만 있다. 메모판 위 획 판정(D12=A와 marker-meets-sticky D4=B 충돌)은 정하지 않았다.
- 실경로 갭: 두 기기 동시 그리기는 Y.Doc 두 개를 직접 동기화한 테스트와 원격 origin 트랜잭션 주입으로 확인했다. 실제 WS 두 기기·실브라우저 확인은 n7 몫이다.

**게이트** (web/, 2026-10-12): `tsc --noEmit` 0 · `vitest run` 200 파일 1764 통과·8 skip(그 뒤 첫 벽 공유 변경은 `state/share`·`components/share` 14 파일 176 통과, tsc·eslint 0) · 바꾼 파일 eslint 0 · `check-i18n.mjs` exit 0(미사용 키 경고 66개는 기존). 새 테스트 35개: `marker/__tests__/tokens`, `cardContent.strokes`, `ydoc/__tests__/strokes`, `db/__tests__/strokesSchema`, `wallStrokes`(스토어 실경로·원격·저장 실패·보드 삭제/되살리기), `share/firstWall` 2건. 옛 스키마 버전을 못 박은 테스트 4곳(`verno` 6→7, 테이블 목록)을 v7에 맞췄다.
