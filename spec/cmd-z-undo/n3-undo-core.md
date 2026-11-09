# n3-undo-core — 보드별 기록 장치, 키 경로, 탭 사이 방송

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-3
**상위**: spec/cmd-z-undo/spec.md
**deps**: n1
**상태**: 아직 안 함
**담당 행**: T5, T7, T11, T22, T23
**사람 확인**: 불필요

## 문제

- 캔버스 cmd+z는 펜 모드에서만 동작한다.
- 보드마다 기록을 쥐는 장치가 없다.
- 탭 사이 방송이 LOCAL_ORIGIN만 보내서, 되돌리기가 다른 탭에 가지 않는다.

## 목표

캔버스에서 cmd+z가 그 보드의 마지막 동작을, cmd+shift+z가 다시 실행을 한다. 기록은 보드 불러오기가 끝난 뒤 생기고 보드를 떠나면 사라진다. 되돌리기는 같은 기기의 다른 탭에도 반영된다.

## 작업

1. n1-verify.md 「T1 확인 결과」를 먼저 읽는다. 틀린 항목이 이 노드 행에 걸리면 그 결과를 따른다.
2. `web/src/state/ydoc/origin.ts`에 기록 안 하는 origin과 그 transact 함수를 둔다. isRemoteTransaction은 두 origin을 모두 로컬로 본다.
3. 새 모듈 `web/src/state/ydoc/undo.ts`: 보드 키별 Y.UndoManager. 범위는 notes·connections 맵, trackedOrigins는 LOCAL_ORIGIN. 100단계 상한. 동작 깊이 카운터와 단계 열기·닫기 API, 묶음 시작·끝 API(captureTimeout 무한↔500). 단계 열기는 기록하는 동작에서만 한다. 기록 안 하는 origin으로 도는 동작은 stopCapturing을 부르지 않고 깊이 카운터도 올리지 않는다. 비동기 동작 전용 단계 API는 두지 않는다. await가 낀 동작은 기본 0.5초 묶음과 진입점 stopCapturing으로 충분하다(스펙 버린 대안 「비동기 동작 단계 묶음」). 되돌리기 전후 기록 길이 비교로 빠진 단계를 모두 넘기는 훅. 단계 meta 칸은 비워 두고 n5·n6이 채운다. 지금 보드의 UndoManager를 돌려주는 getter를 내보낸다. n4~n6 시험이 이것으로 undoStack 길이를 재고 준비 뒤 clear한다.
4. `web/src/state/db/liveSync.ts` attachLiveDoc onUpdate: LOCAL_ORIGIN, 기록 안 하는 origin, 이 탭 UndoManager의 쓰기를 방송한다.
5. `web/src/state/workspace.ts` 보드 불러오기: activateBoard, 첫 실행 시드 :2132, 빈 글상자 정리 :2146·:2188이 끝난 뒤 UndoManager를 만든다. 시드, 정리, 빈 채로 마친 글상자 지우기 :3161은 기록 안 하는 origin으로 쓴다. 정리 쓰기는 `web/src/state/storage.ts` hardDeleteNotes :342-358이 deleteNoteDoc·deleteConnectionDoc 콜백을 writeToBoardDoc에 넘겨 나간다. origin을 실제로 정하는 곳은 `web/src/state/ydoc/model.ts`의 쓰기 헬퍼 9곳의 transactLocal이다(putNote :136, updateNoteField :155, updateNoteFields :175, deleteNote :189, putConnection :207, deleteConnection :217 등). 헬퍼가 origin 인자를 받고, hardDeleteNotes와 콜백이 그 인자를 끝까지 넘기게 한다. n4가 같은 헬퍼 인자를 쓴다. 보드를 떠날 때 이전 보드 UndoManager를 버린다. activeDoc 문서 수명은 바꾸지 않는다.
6. 키 판정을 순수 함수로 뺀다. 새 모듈 `web/src/components/workspace/undoKeys.ts`가 KeyboardEvent 모양과 상태(펜 모드, editingId, expandedCardId, 입력칸 포커스)를 받아 펜 되돌리기, 펜 다시 실행, 캔버스 되돌리기, 캔버스 다시 실행, 없음 가운데 하나를 돌려준다. e.key z와 e.code KeyZ를 모두 받는다. `web/src/components/workspace/Canvas.tsx` 키 처리 :359-402는 이 함수의 답대로 부른다. 펜 분기 :380도 이 함수를 쓴다.
7. 행마다 vitest를 만든다. 새 파일 두 개: `web/src/state/__tests__/undo.core.test.ts`(스토어·문서·방송), `web/src/components/workspace/__tests__/undoKeys.test.ts`(키 판정). 탭 방송은 두 Doc과 가짜 BroadcastChannel로 시험한다.

## 완료 기준

- [ ] 이 노드의 캔버스 시험도 spec.md 「준비 확인」 공통 규칙을 따른다. 준비 뒤 getter로 clear하고 0.6초 기다린 뒤 지금 보드와 undoStack 길이 0을 확인한다. 행 given의 동작 가운데 then이 그 결과를 보는 동작은 준비가 아니다. 준비 확인 뒤에 스토어 액션으로 하고 기록한다. 예: T7·T11의 "X를 옮겼다". T23은 뺀다: 보드 열기 자체가 시험 동작이라 clear 없이 연 직후의 undoStack 길이를 잰다(스펙 :38의 T23 제외). 그 대신 T23의 열기 전후 단언을 지킨다: 둘째는 열기 직전에 빈 글상자가 미러와 문서에 있고, 연 뒤에 둘 다에서 사라졌다. 셋째는 시드 조건 넷으로 열고, 연 뒤에 시드 카드가 문서에 있다. 정리·시드 쓰기가 실제로 일어난 뒤에도 단계 0인지 보기 위해서다. 이 getter는 이 노드가 만든다
- [ ] T5, T7, T11, T22, T23 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.core.test.ts src/components/workspace/__tests__/undoKeys.test.ts`
- [ ] 탭1 되돌리기가 탭2 문서에 반영되고, 그 뒤 탭1 쓰기도 탭2에 반영된다. 같은 명령의 테스트 이름으로 확인
- [ ] 기존 회귀: `cd web && bunx vitest run src/state/__tests__/storeOnYjs.test.ts src/state/__tests__/penMode.test.ts src/state/__tests__/textTool.test.ts src/state/__tests__/n23-single-source.test.ts` 통과
- [ ] 이 노드가 고친 파일에 타입 오류가 없다. 웨이브 2는 n2와 같은 작업 트리를 쓰므로 n2 파일의 오류는 세지 않는다. 확인: `cd web && npx tsc --noEmit 2>&1 | rg -v "cards/_shared/editor/" | rg "error TS"` 출력 없음. n2 파일(web/package.json, web/bun.lock, cards/_shared/editor/)은 add하지 않는다
- [ ] 실경로: 테스트가 실제 workspace 스토어 액션과 activateBoard 경로를 탄다. 우회했으면 구현 메모에 갭을 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/ydoc/origin.ts` | LOCAL_ORIGIN :12, transactLocal :18, isRemoteTransaction :23 |
| `web/src/state/db/liveSync.ts` | attachLiveDoc :74, onUpdate :78-81 |
| `web/src/state/ydoc/activeDoc.ts` | 문서 수명. 읽기만 |
| `web/src/state/workspace.ts` | 불러오기 :2121-2188, hardDeleteNote :3161, setPenMode :3327 |
| `web/src/state/storage.ts` | hardDeleteNotes :342-358 |
| `web/src/state/ydoc/model.ts` | 쓰기 헬퍼 9곳의 transactLocal: :136, :155, :175, :189, :207, :217, :236, :246, :261 |
| `web/src/state/ydoc/writeThrough.ts` | writeToBoardDoc, 활성 문서 쓰기 :56-58 |
| `web/src/components/workspace/Canvas.tsx` | 키 처리 :359-402 |
| `web/src/components/workspace/cards/textbox/Content.tsx` | :83 빈 글상자 지우기 호출 |
| `web/node_modules/yjs/src/utils/UndoManager.js` | 동작 근거 |

## 구현 메모
