# n4-steps — 동작 하나를 1단계로 묶고, 남의 쓰기와 자동 쓰기를 기록에서 뺀다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-4
**상위**: spec/cmd-z-undo/spec.md
**deps**: n3, n2
**상태**: 진행
**담당 행**: T4, T6, T8, T9, T10, T20, T5의 화면 수준 칸 전부(여러 장 드래그, 휴지통 드롭, 놓기 길 포함)
**사람 확인**: 불필요

## 문제

- 0.5초 묶음만으로는 크기 조절, 편집, 펜 모드가 여러 단계로 쪼개진다.
- 자동 측정, MCP 브리지, 멤버십 동기화의 쓰기가 내 기록에 들어가면 cmd+z가 헛돈다.

## 목표

사용자 동작 하나가 기록 1단계다. 편집 1회, 펜 모드 1회, 크기 조절 1회, 드래그 1회가 각각 1단계다. 기록 안 하는 쓰기 열한 가지는 기록에 들어가지 않는다.

## 작업

1. n3이 만든 `web/src/state/ydoc/undo.ts` 단계 API를 쓴다. 가장 바깥 동작 진입점에서만 단계를 연다. 기록 안 하는 origin으로 도는 동작(브리지, 멤버십, 자동 측정)은 단계를 열지 않는다. 그래서 깊이 0에서 await 사이에 두 번 쓰는 기록 동작 사이에 브리지 쓰기가 끼어도 그 동작이 둘로 갈리지 않는다. 편집 묶음 안에서는 묶음 깊이가 이미 막는다. 단계를 여는 진입점은 문서에 쓰는 사용자 동작 전부다. 최소 목록: addCardAt :2540, addPhotoAt :2586, addFrameAt :2743, setFrameBackground :2894, clearFrameBackground :2929, deleteFrame :2951, setContent, setTitle, setMemoColor :3044, connectCards :3237, setConnectionLabel :3297, removeConnection :3287(스토어 액션, Canvas.tsx:408에서 부름), remove :3421, removeSelected :3475, restoreFromTrash :3561, commitMove :2680, resolveMembership :2765, resizeCard :2713, moveSelectedBy :2645, setTextWidth :3098, 드래그·크기 조절·편집·펜 모드. commitMove·resolveMembership·resizeCard가 진입점이어야 컴포넌트 묶음을 뺐을 때 화면 수준 시험이 실패한다. 전수는 workspace.ts 스토어 액션 가운데 withActiveDoc·persistCard·persistCardDebounced·storage 쓰기를 부르는 것을 rg로 찾아 구현 메모에 표로 남긴다. 공통 장치(액션 감싸기 함수 하나)로 열어도 된다.
2. 드래그: DraggableCard.tsx에서 드래그 시작부터 mouseup까지를 한 묶음으로 감싼다. 여러 장 드래그(moveSelectedBy)는 이동 중에도 문서에 쓰기 때문이다(workspace.ts:2672). 크기 조절: ResizeHandles.tsx 시작~끝을 묶는다. 드래그 묶음은 첫 이동(d.moved = true, DraggableCard.tsx:641)에서 연다. 이동 없는 클릭은 묶음을 열지 않는다(onMouseDown은 :312~:334에서 일찍 돌아간다). onUp의 모든 길에서 닫는다(:832, :842, :856, :866, :874의 이른 return 포함). 휴지통·함 흡수·내보내기 드롭은 그 동작이 끝난 뒤 닫는다. 닫는 자리는 애니메이션 길과 jsdom의 즉시 길이 함께 지나는 done(DraggableCard.tsx:727-730)이다. commit이 거부돼 카드가 남는 길(:759-761)도 done을 지난다. 스펙 :505의 anim.onfinish 인용보다 이 자리가 정확하다. 글상자 좌우 핸들은 자기 onUp(ResizeHandles.tsx:116)에서 닫는다. 묶음 끝은 마지막 쓰기 뒤에 부른다. 판 크기 조절은 resolveMembership(ResizeHandles.tsx:213) 뒤다. 언마운트 cleanup은 아직 안 닫힌 토큰만 닫는다(ResizeHandles.tsx:84-90은 지금 리스너만 뗀다).
3. 편집: 카드 안 편집 시작~끝과 펼친 메모 창 열기~닫기를 각각 1단계로 묶는다. n1 결과: 카드 앞면은 제목만 고치고 본문 편집기는 펼친 메모 창(MemoExpandDialog.tsx:134)에만 있다. 창을 닫으면 편집기가 없어지며 마지막 200ms 입력이 문서에 안 쓰인다(n1 2번). 아래 flush 훅이 이 기존 손실도 막는다. 편집 묶음은 스토어가 소유한다. editingId나 expandedCardId가 가리키는 카드마다 연다. 값이 다른 카드로 바뀌면 앞 묶음을 닫고 새 묶음을 연다. 둘 다 비거나 그 카드가 cards에서 사라지면 닫는다. 카드를 만드는 동작은 시작할 때 열린 편집 묶음을 먼저 닫고, 새 카드가 편집 상태로 열리면 생성 단계를 닫은 뒤 그 카드의 묶음을 연다(스펙 AV4: addCardAt :2578이 editingId를 바로 바꾼다). 장치는 setEditing에 걸지 않고 스토어 구독으로 한다. editingId를 쓰는 곳이 workspace.ts에 20곳이고 18곳이 setEditing·setExpandedCard를 거치지 않는다(addCardAt :2578, enterEditOnSelected :3639). 닫기 순서: 편집기는 마운트될 때 남은 본문을 내보내는 flush 훅을 스토어에 등록한다. 구독이 묶음을 닫을 때는 그 훅을 먼저 부르고, 그 쓰기가 끝난 뒤 닫는다. 상태 변화 직후 바로 닫으면 마지막 0.2초 안의 글이 묶음 밖 새 단계가 된다. 편집 끝에 다른 쓰기가 있는지는 n1 「T1 확인 결과」 2번을 따른다. 원격 반영(workspace.ts:1590-1612)이 편집 중 카드를 지우는 길도 닫는다. 펼친 창은 `web/src/components/workspace/cards/MemoExpandDialog.tsx:137`이 setContent를 바로 부르고 setExpandedCard(workspace.ts:3229-3234)가 editingId를 null로 만든다. 편집을 마칠 때 Milkdown listener의 0.2초 디바운스에 남은 본문을 먼저 내보낸 뒤 단계를 닫는다. 근거 줄은 n1 「T1 확인 결과」 2번.
4. 펜 모드: 들어갈 때~나올 때를 묶는다. n3가 펜 묶음을 이미 만들었다(커밋 3109ad1, n3 리포트 「호출자가 정할 것」). 다시 만들지 않고 그것을 쓴다. 펜 묶음은 스토어가 소유하고 상태 규칙으로 연다. penMode가 켜지면 열고 꺼지면 닫는다. setPenMode(workspace.ts:3327-3338)만이 아니라 armTextPlacement(:3157)처럼 penMode를 바로 끄는 길도 덮도록 스토어 구독으로 한다. 펜 모드가 켜진 채 보드를 바꾸면 새 보드 UndoManager에서 다시 연다. 펜 모드 안 cmd+z는 펜 스택 그대로. 근거 줄은 n1 3번.
5. 기록 안 하는 쓰기: setFaceHeight, setTextMeasuredWidth, updatedAt만 바뀐 쓰기, files 맵(`web/src/state/share/attachments.ts`), 보드 사이 옮기기, 함 삭제, 멤버십 동기화(`web/src/state/membership.ts` :172, :183). origin은 n3이 넓힌 `web/src/state/ydoc/model.ts` 헬퍼 인자로 넘긴다. model.ts 밖에서 transactLocal을 직접 부르는 곳은 바깥 호출이 안쪽 헬퍼 인자를 덮으므로 그 호출 자체가 origin을 받는다. 기록 안 하는 대상은 removeSelected :3531(함 쪽)과 attachments.ts :141·:168이다. 전수: `rg -n "transactLocal\(" web/src --glob '!**/__tests__/**' --glob '!**/ydoc/model.ts' --glob '!**/ydoc/origin.ts'` 7곳(마이그레이션 2곳, commitMove :2699, writeThrough :143 포함)을 구현 메모에 표로 남긴다. 기록 안 하는 동작은 안쪽에서 부르는 동작까지 같은 origin으로 돈다. 예: setFaceHeight :3134-3149는 안에서 resolveMembership을 부르고 그 쓰기가 writeCardToDocHandle → model.ts transactLocal로 나간다. 동기 경로는 동작 전체를 기록 안 하는 origin 문맥으로 감싸고, 비동기 경로는 인자로 넘긴다. await 뒤에 문서에 쓰는 길은 모두 인자로 넘긴다. 알려진 길: saveConnection(storage.ts:661-672), 보드 사이 옮기기 moveCardBetweenDocs(workspace.ts:1729, 호출 :3660·:3844·:3908), 멤버십(membership.ts :172·:183. :162 saveNote는 미러만 씀), writeToBoardDoc의 await handle.whenLoaded 뒤 쓰기(writeThrough.ts:48-60), notes.createBoard가 부르는 createSubcanvas의 await 뒤 persistCard(workspace.ts:3775. persistCard가 origin 인자를 받는다), removeConnection(storage.ts:674-680), updateNoteTitle(storage.ts:321-334), setConnectionLabel의 void saveConnection(workspace.ts:3315). 이 목록은 예이고 전부가 아니다. moveCardBetweenDocs는 await 세 번 뒤 :1761의 withActiveDoc(… deleteNoteDoc …)로 활성 문서에 쓰므로 deleteNoteDoc까지 origin을 인자로 넘긴다. 함 만들기(createSubcanvas :3735, Dock.tsx:384·:437)도 기록 안 하는 origin으로 쓴다. 함 삭제: 함 카드의 문서 삭제는 cascadeDeleteFunnels보다 먼저 remove :3462의 deleteNoteDoc에서 일어난다. 함이면 이 쓰기를 기록 안 하는 origin으로 한다. removeSelected :3530-3534는 함과 일반 메모를 한 트랜잭션으로 지우므로 둘로 나눈다. 함 쪽만 기록 안 하는 origin이다. n3이 이미 맡은 불러오기 정리·시드·빈 글상자 지우기는 다시 하지 않는다.
6. MCP 브리지(`web/src/state/bridge/mossBridge.ts`): 브리지가 부르는 스토어 액션과 storage·writeThrough 쓰기 함수가 origin 옵션을 받아 Y.Doc 쓰기까지 끝까지 넘긴다. await 뒤 쓰기도 같다. 판정은 동작 테스트로 한다(메인 결정): `spec/cmd-z-undo/rows/T20.json` when 칸의 여섯째 경우 6-1~6-13을 그 준비대로 지금 보는 보드 P에 실행한다. 경우마다 P를 새로 준비한다. 준비는 아래 완료 기준의 「준비 확인 규칙」을 따른다. 6-12의 target 메모는 다른 보드 Q의 메모라 P 스토어 cards에 없다. 준비 확인에서 이것도 본다(스펙 T20 6-12). 그다음 브리지 호출을 한다. clear해야 시험 앞 기록 길이가 0이다. clear 뒤 늦게 닿은 준비 쓰기는 준비 확인의 undoStack 0에서 드러난다. 경우마다 세 칸을 판정한다: 호출 성공(throw 없음), P 문서가 바뀜, P undoStack 길이 그대로. 명령의 promise를 기다린 뒤 그 경우에 기대한 문서 변화가 모두 보일 때까지 실제 시간으로 최대 2초 기다리고(조건 대기), 그 뒤 0.1초 더 기다려 판정한다. 기대 변화는 행에 적힌 칸 전부다. 예: 6-11은 연결선과 label 둘 다다. 단 6-5의 "그 연결선이 P 문서에서 사라짐"은 n5가 만드는 동작이라 이 노드는 빼고 기다리고 판정한다. 기대 변화 대기가 2초를 넘으면 그 경우는 실패다. connectCards·setConnectionLabel·createSubcanvas는 promise를 돌려주지 않고 각자 void saveConnection·void async로 따로 쓴다(workspace.ts:3266, :3315, :3735). flushAll은 카드 예약 쓰기만 기다린다. 그리고 브리지 origin 넘기기를 빼면 표의 한 줄 이상이 실패함을 확인한다. 명령은 8종이다: notes.create, notes.update, notes.delete, photos.create, frames.create, notes.createBoard, connections.create, connections.delete. notes.update는 content·title·width·height·x·y만 받는다. color·rotation은 notes.create 몫이다. connections.create는 카드 위치로, notes.delete는 대상 종류(일반 메모, 사진 카드, 판)로 길이 갈린다. 구현 때 참고할 호출 위치: ws.* 30곳(`rg -n "\bws\.[A-Za-z]+\(" web/src/state/bridge/mossBridge.ts`), writeNoteRecord :399·:441·:455·:560, writeBoardRecord :559, deleteNoteRecord :472, storeAttachment :187·:202·:215·:493, updateNoteTitle :443(storage.ts:321-334가 문서에 씀), saveConnection :687, removeConnection :702, notes.createBoard의 ws.createSubcanvas(workspace.ts:3735, await 뒤 persistCard :3775). 미러만 쓰는 호출은 saveNote :398·:440·:448·:557과 saveBoard :539다.
7. T4: 편집 중이고 편집기 기록이 비었을 때 cmd+z가 캔버스 기록을 바꾸지 않는다. n3의 undoKeys와 스토어로 캔버스 쪽을 시험한다. 편집기 쪽 판정은 브라우저 확인 항목으로 구현 메모 「브라우저 확인」에 적는다.
8. 행마다 vitest. 새 파일 `web/src/state/__tests__/undo.steps.test.ts`, `web/src/components/workspace/__tests__/DraggableCard.undo.test.tsx`, `web/src/components/workspace/__tests__/ResizeHandles.undo.test.tsx`.

## 완료 기준

- [x] 준비 확인 규칙(spec.md 「준비 확인」 공통 규칙, 스펙 리뷰 19바퀴 AN0): 이 노드의 캔버스 cmd+z 시험에 쓴다. 순서: 준비를 하고, n3가 내보내는 지금 보드 UndoManager getter로 clear하고, 실제 시간 0.6초 기다리고, 준비 확인을 한다. 준비 확인은 둘이다: 지금 보드가 그 행의 보드다. undoStack 길이가 0이다. 준비 확인이 실패하면 그 시험은 실패다. 행 given의 동작 가운데 then이 그 결과를 보는 동작은 준비가 아니다. then이 되돌아가는지 보든 그대로인지 보든 같다. 예: 만들었다·지웠다·고쳤다·살렸다·옮겼다·바꿨다·그었다. 준비 확인 뒤에 스토어 액션으로 실제로 하고 기록한다. 이 정의는 내 탭의 동작에만 쓴다. 다른 탭·다른 기기의 동작은 그쪽 Y.Doc에서 하고 update로 이어 붙인다. 내 기록에 들어가지 않는다. 부정형 판정 앞의 긍정 단언은 spec.md 「준비 확인」 공통 규칙의 닫힌 목록에 있는 판정에만 둔다. 목록 밖의 "없음·그대로·0" 판정에는 두지 않는다. 행이 따로 둔 단언은 이 목록과 별개로 지킨다. T5 드롭 직후 frameId, T20 첫째 칸 바뀜, T23 둘째 연 뒤 사라짐, T23 셋째 연 뒤 시드 카드가 그렇다. 화면 컴포넌트가 여러 호출을 한 단계로 묶는 동작은 드래그(DraggableCard)와 크기 조절(ResizeHandles)이다. 스토어 수준 시험은 드래그 시작부터 끝까지의 호출을 n3의 묶음 시작·끝 API로 감싼다. 드래그는 이동 호출(moveCard 또는 여러 장이면 moveSelectedBy) 여러 번, commitMove, resolveMembership을 조건 없이 이 순서로, 크기 조절은 resizeCard 여러 번이다. 여러 장 드래그는 이동 중에도 문서에 쓴다(workspace.ts:2672). 감싸지 않으면 n4 뒤에는 진입점마다 단계가 끊긴다. 그와 별도로 n4가 화면 수준 시험을 하나씩 둔다(spec.md 「준비 확인」 공통 규칙). moveCard만으로는 문서에 쓰지 않는다(workspace.ts:2633-2643). 준비 방법은 구현자가 고른다. 스토어 액션도, model.ts 헬퍼와 Dexie 직접 쓰기도 된다. 보드 열기는 loadFromStorage나 setCurrentBoard로 한다. connectCards처럼 await 뒤 문서에 쓰는 준비 동작은 그 쓰기가 문서에 보인 뒤 clear한다. 행이 가짜 타이머나 가짜 시계를 쓰면 준비와 준비 확인은 실제 시간으로 하고, 가짜 타이머는 그 뒤에 켠다. setImmediate는 가짜로 바꾸지 않는다. 예: vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }). 기본 설정은 setImmediate까지 바꿔 Dexie 읽기·쓰기가 멈춘다. 동작 뒤 조건 대기가 2초 안에 서지 않으면 그 경우도 실패다. 준비할 때 걸리는 곳: 관찰자는 LOCAL_ORIGIN 쓰기를 스토어에 반영하지 않는다(origin.ts:23-25). 연결선 문서 쓰기·지우기는 source 메모의 미러 행과 연결선 미러 행을 읽는다(writeThrough.ts:94-98, storage.ts:674-679). 연결선 살리기는 trashConnections 행과, 되살린 메모 반대편 메모의 미러 행을 읽는다(storage.ts:460-471). 비시스템 보드는 db.boards 행이 있어야 열린다(workspace.ts:2161-2170). T20은 준비 확인에서 준비한 P 카드가 P 문서, 스토어 cards, 미러 notes에 모두 있는지도 본다. 연결선 쓰기·지우기가 source 메모의 미러 행을 읽기 때문이다(writeThrough.ts:94-98)(스펙 T20 when 맨 앞 문장). T20은 단계 0을 재는 행이라 스토어에 없는 카드에 쓰는 빈 동작도 단계 0으로 거짓 통과한다(workspace.ts:3140 `if (!prev || prev.height === h) return`). 같은 이유로 T20 첫째의 setFaceHeight·setTextMeasuredWidth 호출은 매번 값을 바꾸고, 호출마다 그 칸이 P 문서에서 바뀌었는지 본다. setTextMeasuredWidth 대상은 autoWidth가 켜진 글상자다(:3126-3127). T20 다섯째와 6-13은 브리지 호출 직전에 그 연결선이 P 문서와 미러 connections에 있다고 단언한다(행의 when 다섯째)
- [x] T4 캔버스 쪽, T6, T8, T9, T10, T20 then 칸의 「확인」이 통과한다. T20 6-5의 연결선 사라짐 칸은 빼고 판정한다(n5가 더함). 확인: `cd web && bunx vitest run src/state/__tests__/undo.steps.test.ts`
- [x] 글상자를 편집하는 동안 자동 폭·높이 측정 액션을 편집 쓰기 사이마다 다른 값으로 직접 불러도 편집을 마친 뒤 undoStack 길이가 1이고 cmd+z 1번에 편집 전 글로 돌아간다. 기록 안 하는 동작이 단계를 안 여는 분기는 이 테스트로 판정하지 않는다. 편집 묶음 깊이가 이미 막기 때문이다(스펙 AT5). 대신 깊이 0에서 await 사이에 두 번 쓰는 기록 동작 하나를 코드에서 골라, 두 쓰기 사이에 기록 안 하는 쓰기를 끼워도 1단계인지 본다. 이 분기를 빼면 그 경우가 2단계가 되어 실패한다. 고른 동작과 실패 출력 한 줄을 구현 메모에 남긴다
- [x] 위 진입점 목록의 동작마다 정상 입력으로 한 번 부르면 undoStack이 정확히 1 늘어난다. 정상 입력은 지금 보드의 일반 카드이고 그 동작이 값을 바꾸는 입력이다. commitMove는 움직인 카드, resolveMembership은 소속이 바뀌는 카드, resizeCard는 크기가 바뀌는 입력이다. await 뒤 문서에 쓰는 진입점은 그 동작이 낸 문서 변화가 보일 때까지 실제 시간으로 최대 2초 조건 대기하고, 그 뒤 0.1초 더 기다려 잰다. 기대 변화: connectCards는 그 연결선, setConnectionLabel은 그 연결선의 label 칸, restoreFromTrash는 살린 메모와 되돌린 연결선. removeConnection은 그 연결선이 문서에서 사라짐이다. 이 넷은 promise를 돌려주지 않거나(connectCards :3266·setConnectionLabel :3315의 void saveConnection, removeConnection :3294의 void storage.removeConnection) await 뒤에 쓴다(restoreFromTrash). 이 밖에도 await 뒤나 void 비동기로 문서에 쓰는 진입점은 모두 같은 대기로 잰다. 함 만들기(createSubcanvas)는 기록하지 않으므로 +1 대상이 아니다(메인 결정, 스펙 기록 안 하는 쓰기 목록). 함 카드 삭제는 0이고 이 노드가 판정한다. 다른 보드 메모 살리기는 0이고 n5가 만들고 n6이 T15로 판정한다. 같은 명령의 테스트 이름으로 확인
- [x] T20 다섯째는 `spec/cmd-z-undo/rows/T20.json`의 다섯째 given·when·then 칸 전부를 따른다. given의 "새로 잇는 두 메모는 둘 다 P 메모이고 기존 연결선과 다른 방향 쌍"을 지킨다. 같은 방향 쌍이면 connectCards가 새 행 없이 기존 선을 돌려준다(workspace.ts:3239-3248). 판정 대상은 사진 카드·판 만들기, 연결선 잇기·지우기, 기대 변화 넷, 지운 연결선이 cmd+z로 안 돌아옴이다. 준비는 「준비 확인 규칙」을 따른다. 기존 연결선의 양 끝 메모와 새로 이을 두 메모도 준비 확인 대상이다. 여섯째와 같은 조건 대기로 재고 가짜 타이머를 쓰지 않는다
- [x] T20 여섯째의 경우 6-1~6-13(행의 when 칸)마다 세 칸이 통과한다. 단 6-5의 기대 변화 가운데 "그 연결선이 P 문서에서 사라짐"은 n5가 만드는 동작이라 이 노드는 빼고 판정하고, n5가 같은 테스트에 더한다. 세 칸: 호출 성공(throw 없음), P 문서가 바뀜, P undoStack 길이 그대로. 구현 메모에 경우 번호와 세 칸 결과 표를 남긴다. 멤버십 쓰기는 P가 시스템 보드일 때 시험한다. 같은 명령의 테스트 이름으로 확인
- [x] T20 "빼면 실패" 넷을 구현 메모에 실패 출력 한 줄씩 남긴다: 브리지 origin 넘기기를 빼면 넷째·다섯째와 여섯째 표의 한 줄 이상이(셋째 칸에서), 멤버십 origin을 빼면 둘째가, 편집 중 브리지 쓰기의 origin을 LOCAL_ORIGIN으로 바꾸면 셋째가 실패한다. 단계를 안 여는 분기는 위 깊이 0 비동기 경우가 판정한다
- [x] 함 삭제가 undoStack 길이를 바꾸지 않는다. 같은 명령의 테스트 이름으로 확인
- [x] 구현 메모에 model.ts 밖 직접 transactLocal 7곳 표, 진입점 표, 「브라우저 확인」 항목이 있다
- [x] 기존 회귀: `cd web && bunx vitest run src/state/__tests__/undo.core.test.ts src/state/__tests__/membership.test.ts src/state/__tests__/memoHeight.test.ts src/state/__tests__/subcanvas.test.ts src/state/__tests__/penMode.test.ts src/state/__tests__/frames.test.ts` 통과
- [x] `cd web && npx tsc --noEmit` 통과
- [x] 실경로: 드래그·크기 조절 테스트가 실제 스토어 액션 순서를 탄다. 우회했으면 구현 메모에 갭을 적는다
- [x] 화면 수준 묶음 시험(T5 화면 칸 전부, T6 첫째 화면 칸): 보드 문서와 UndoManager가 열린 상태에서 준비 확인을 한 뒤 시작한다. DraggableCard와 ResizeHandles의 mouseup 처리에서 나가는 모든 길마다 시험을 하나씩 둔다. 이른 return 길(DraggableCard.tsx:832, :842, :856, :866, :874)과 ResizeHandles 글상자 너비 경로(:98-132, setTextWidth가 이동마다 문서에 씀)도 든다. 길 목록은 코드에서 찾아 구현 메모 표로 남긴다. 내보내기·함 흡수처럼 놓은 뒤 비동기로 끝나는 길은 commit 약속이 끝날 때까지 실제 시간 최대 2초 조건 대기한 뒤 단언한다. 길마다 셋을 단언한다. 첫째, cmd+z 앞에 그 길이 실제로 쓴 결과가 문서에 있다. 소속이 바뀌는 길이면 모든 카드의 frameId도 본다. 둘째, 길이 끝난 뒤 묶음 깊이 0, captureTimeout 500이다. 셋째, 쓴 것이 있으면 undoStack이 1 늘고 cmd+z 1번에 그 길의 쓰기가 모두 돌아간다. 애니메이션이 있는 길은 element.animate를 가짜로 심고 onfinish를 손으로 부른 뒤 판정한다(본보기 DraggableCard.trashDrop.test.tsx:158-166, jsdom에는 animate가 없어 runTrash가 바로 지운다 :731-733). 반드시 든 경우: 판 F 안 드롭, 두 카드 판 F 안 드롭, 두 카드 휴지통 드롭(지우기 뒤 판정), 이동 없이 놓기, 내보내기, 함 흡수, 크기 조절 30번, 판 크기 조절로 X가 F에 들어옴(cmd+z 앞 X frameId F), 크기 조절 중 언마운트(다음 동작 둘이 2단계), 편집 중 그 카드 끌기(편집을 마친 뒤 1단계, cmd+z 1번에 편집과 이동이 함께 돌아간다), 편집 중 그 카드 원격 삭제(묶음 깊이 0, 다음 동작 둘이 2단계), 펜 모드를 켠 채 보드 바꾸기(새 보드 깊이 1, 옛 토큰 끝이 와도 1, 펜 두 획 1단계). 컴포넌트의 묶음 호출을 빼면 실패함을 구현 메모에 실패 출력 한 줄씩 남긴다. 확인: `cd web && bunx vitest run src/components/workspace/__tests__/DraggableCard.undo.test.tsx src/components/workspace/__tests__/ResizeHandles.undo.test.tsx src/state/__tests__/undo.steps.test.ts`

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/ydoc/undo.ts` | n3이 만든 단계 API |
| `web/src/components/workspace/DraggableCard.tsx` | 드래그 :635, :687, :891 |
| `web/src/components/workspace/ResizeHandles.tsx` | 크기 조절 :106, :173, :197 |
| `web/src/components/workspace/cards/_shared/MarkdownEditor.tsx` | 본문 쓰기 :101 |
| `web/src/state/workspace.ts` | setContent :2992-3006, setFaceHeight :3135-3149, setTextMeasuredWidth :3118-3132, setPenMode :3327, cascadeDeleteFunnels :1932 |
| `web/src/state/share/attachments.ts` | files 맵 :140-145 |
| `web/src/state/bridge/mossBridge.ts` | 브리지 ws.* 호출 30곳 |
| `web/src/state/storage.ts` | saveConnection :661-672 |
| `web/src/state/ydoc/model.ts` | 쓰기 헬퍼의 origin 인자(n3이 넓힘) |
| `web/src/state/workspace.ts` | remove :3421-3473(함 문서 삭제 :3462), removeSelected :3475-3547(문서 삭제 :3530-3534) |
| `web/src/state/ydoc/writeThrough.ts` | writeToBoardDoc, 활성 문서 쓰기 :56-58 |
| `web/src/components/workspace/cards/MemoExpandDialog.tsx` | 펼친 창 setContent :137 |
| `web/src/components/workspace/undoKeys.ts` | n3이 만든 키 판정 |
| `web/src/state/membership.ts` | :172, :183 |

## 구현 메모

2026-11-10 runner. 완료 기준 13개를 모두 확인했다. 새 시험 70개와 기존 회귀 108개가 통과한다.

**장치**
- 진입점: `workspace.ts` 끝의 `recorded()`가 액션을 감싼다. 가장 바깥 액션에서만 `openUndoStep(문맥 origin)`을 부른다.
- 기록 안 하는 동작: `untracked()`가 동기 구간을 `withWriteOrigin(UNTRACKED_ORIGIN)`으로 돌린다. 안쪽 액션도 같은 origin이다.
- `origin.ts`: `transactLocal`은 origin이 없으면 문맥 origin을 쓴다. 문맥 밖이면 LOCAL_ORIGIN이다.
- 편집 묶음: 스토어 구독이 editingId·expandedCardId·cards를 따른다. 닫기 전에 `runEditFlush()`를 부른다(`web/src/state/editFlush.ts`).
- 편집기 flush: `MarkdownEditor.tsx` MilkdownInner가 편집 가능할 때 등록한다. serializer로 지금 본문을 읽어 안 내보낸 글이면 onChange로 쓴다.
- 브리지: `dispatchOp`의 `ws`를 Proxy로 감싼다. 모든 액션이 기록 안 하는 문맥에서 돈다. storage·writeThrough 직접 호출은 `BRIDGE_ORIGIN`을 넘긴다.
- 수정 시각만 바뀐 쓰기: `writeCardToDocHandle`이 문서와 비교해 updatedAt만 바뀌면 기록 안 하는 origin으로 쓴다.

**model.ts 밖 직접 transactLocal — 8곳**

removeSelected 한 곳을 일반·함 둘로 나눠 7곳이 8곳이 됐다.

| 위치 | 쓰기 | origin |
|---|---|---|
| attachments.ts:142 | uploadAttachment files 맵 | UNTRACKED 명시 |
| attachments.ts:173 | markQuotaFailed files 맵 | UNTRACKED 명시 |
| workspace.ts:2858 | commitMove 좌표 | 문맥(진입점) |
| workspace.ts:3701 | removeSelected 일반 메모 | 문맥(진입점) |
| workspace.ts:3706 | removeSelected 함 카드 | UNTRACKED 명시 |
| writeThrough.ts:146 | clearBoardRecords 덮어쓰기 가져오기 | 문맥, 손대지 않음 |
| dexieMigration.ts:326 | Dexie→문서 이전 | 문맥, 손대지 않음 |
| systemBoardMigration.ts:84 | 옛 시스템 문서 복사 | 문맥, 손대지 않음 |

**진입점 표** — 후보는 withActiveDoc·persistCard·persistCardDebounced·storage 쓰기를 부르는 액션이다. 줄은 workspace.ts 구현 줄이다.

| 처리 | 액션(줄) |
|---|---|
| 단계 열기 + 편집 묶음 먼저 닫기 | addCardAt 2699, addPhotoAt 2745, addCardAtViewportCenter 2780, addFrameAt 2902, addFrameAtViewportCenter 2915, connectToNewMemo 3431, commitAndAddNext 3767 |
| 단계 열기 | moveSelectedBy 2804, commitMove 2839, resizeCard 2872, resolveMembership 2924, resizeFrame 3003, renameFrame 3038, setFrameBackground 3053, clearFrameBackground 3088, deleteFrame 3110, setContent 3151, setTitle 3167, commitTitle 3182, setMemoColor 3203, setCardRotation 3221, setTextStyle 3237, setTextWidth 3257, setAttachment 3343, connectCards 3397, removeConnection 3448, setConnectionLabel 3458, setOverlay 3506, penUndo 3524, penRedo 3544, penClear 3564, remove 3584, removeSelected 3641, restoreFromTrash 3741, toggleAIOptOut 3855 |
| 기록 안 함(문맥) | setTextMeasuredWidth 3277, setFaceHeight 3294, createSubcanvas 3915 |
| 감싸지 않음 | moveCard 2792·moveFrame 2956: 문서에 안 쓴다. hardDeleteNote 3320: n3이 UNTRACKED. moveCardToSubcanvas 4000·moveCardToBoard 4061·promoteCardToNewBoard 3822: moveCardBetweenDocs가 UNTRACKED. renameBoard 2529: meta만 쓴다(기록 범위 밖). undoSubcanvasRemove 4130: Dexie만 쓴다 |

- await 뒤 쓰기에 origin을 넘기는 길: connectCards·setConnectionLabel의 saveConnection, removeConnection, createSubcanvas의 persistCard, moveCardBetweenDocs, 멤버십 :172·:183, 브리지의 writeNoteRecord·deleteNoteRecord·writeBoardRecord·updateNoteTitle·saveConnection·removeConnection.
- 함 카드 삭제: remove의 deleteNoteDoc이 함이면 UNTRACKED다. removeSelected는 함 쪽 트랜잭션을 따로 연다.

**DraggableCard mouseup 길 표** — 줄은 DraggableCard.tsx다. 묶음은 첫 이동 :662에서 연다.

| 길 | 닫는 자리 | 시험 |
|---|---|---|
| 다중 선택 클릭, 이동 없음 | :869 | 다중 선택 중 클릭 |
| 이동 없는 클릭 | :880 | 이동 없이 놓기 |
| 휴지통 | done :756 | 휴지통 한 장(jsdom 즉시), 휴지통 두 장(가짜 animate) |
| 내보내기 | done :756 | 내보내기(브레드크럼) |
| 함 흡수 | done :756 | 함 흡수 |
| 함 흡수 거부, 카드 남음 :788 | done :756 | 함 흡수 거부(사이클 가드) |
| 보통 드롭 한 장·여러 장·판 | :991, resolveMembership 뒤 | 보통 드롭, 여러 장 드롭, 판 단독 드래그 |
| 언마운트 | 정리 effect | 드래그 중 언마운트 |

**ResizeHandles 길 표** — 묶음은 누를 때 :110에서 연다.

| 길 | 닫는 자리 | 시험 |
|---|---|---|
| 메모·사진 크기 조절 | onUp :232 | 메모 크기 조절 30번 |
| 판 크기 조절 | onUp :232, resolveMembership 뒤 | 판 크기 조절로 X가 F에 들어옴 |
| 글상자 좌우 핸들 | 자기 onUp :134 | 글상자 오른쪽 핸들, 글상자 왼쪽 핸들 |
| 누르고 안 움직임 | onUp :232 | 누르고 움직이지 않고 놓기 |
| 언마운트 | 정리 effect :101, 안 닫힌 토큰만 | 크기 조절 중 언마운트 |

**T20 여섯째 경우 표** — 실제 시간이다. 세 칸은 호출 성공, P 문서 바뀜, undoStack 그대로다.

| 경우 | 호출 성공 | 문서 바뀜 | undoStack 0 | 브리지 origin을 빼면 |
|---|---|---|---|---|
| 6-1 notes.create | 통과 | 통과 | 통과 | 실패 |
| 6-2 notes.update content | 통과 | 통과 | 통과 | 실패 |
| 6-3 notes.update title | 통과 | 통과 | 통과 | 실패 |
| 6-4 notes.update width·height | 통과 | 통과 | 통과 | 실패 |
| 6-5 notes.delete 일반 메모 | 통과 | 통과 | 통과 | 실패 |
| 6-6 notes.delete 사진 | 통과 | 통과 | 통과 | 실패 |
| 6-7 notes.delete 판 | 통과 | 통과 | 통과 | 실패 |
| 6-8 photos.create | 통과 | 통과 | 통과 | 실패 |
| 6-9 frames.create | 통과 | 통과 | 통과 | 실패 |
| 6-10 notes.createBoard | 통과 | 통과 | 통과 | 통과 |
| 6-11 connections.create label | 통과 | 통과 | 통과 | 실패 |
| 6-12 connections.create 다른 보드 target | 통과 | 통과 | 통과 | 실패 |
| 6-13 connections.delete | 통과 | 통과 | 통과 | 실패 |

- 6-5의 연결선 사라짐 칸은 뺐다. n5가 더한다.
- 6-10은 origin을 빼도 통과한다. createSubcanvas가 스스로 기록 안 하는 동작이기 때문이다.

**빼면 실패** — 고친 줄을 되돌려 돌린 출력이다. 변이 스크립트는 레포 밖 scratchpad의 mutate.py다.
- 단계를 안 여는 분기(undo.ts openUndoStep의 UNTRACKED 검사): `× … 깊이 0 비동기 동작: 휴지통 살리기의 연결선 쓰기와 카드 쓰기 사이에 브리지 쓰기가 끼어도 1단계다`.
  - 고른 동작은 restoreFromTrash다. 연결선 쓰기와 카드 쓰기 사이에 브리지 notes.update가 끼는 순서를 단언한다.
- 브리지 origin 넘기기: 17개 실패. 넷째 `× … 넷째: 브리지가 메모를 만들고 …`, 다섯째 `× … 다섯째: 브리지가 사진·판을 만들고 …`, 여섯째 12줄 `× … 6-1 notes.create …`.
- 멤버십 origin: `× … 둘째: 시스템 보드 P에 브리지가 메모 1개 쓰고 1개 지우고, 멤버십이 …`.
- 편집 중 브리지 쓰기를 LOCAL_ORIGIN으로: `× … 셋째: Y 편집 사이에 브리지가 Z를 고쳐도 편집이 1단계 …`.
- 진입점 감싸기(RECORDED 목록): 진입점 17개 실패, 예 `× … commitMove(움직인 카드): undoStack +1`.
- 편집 묶음 구독: 6개 실패, 예 `× … T8 … 첫째: 펼친 창에서 1초씩 쉬며 두 번 치고 마치면 …`.
- 수정 시각만 쓰기·측정 액션의 기록 안 함: 각각 `× … T20 … 첫째: 측정 6번·수정 시각만 쓰기 …`.
- DraggableCard 묶음 열기: 6개 실패, 예 `× … 보통 드롭: 판 밖 A를 F 안에 놓으면 +1 …`.
- DraggableCard 언마운트 닫기: `× … 드래그 중 언마운트 …`.
- 휴지통 묶음을 지우기 전에 닫기: `× … 휴지통 두 장(가짜 animate) …`.
- ResizeHandles 묶음 열기: 5개 실패, 예 `× … 메모 크기 조절 30번 …`.
- ResizeHandles 언마운트 닫기: `× … 크기 조절 중 언마운트 …`.
- 판 크기 조절 묶음을 resolveMembership 앞에서 닫기: `× … 판 크기 조절로 X가 F에 들어옴 …`.

**실경로 갭**
- 화면 시험은 실제 컴포넌트와 실제 스토어 액션, 실제 보드 문서·UndoManager를 탄다.
- jsdom 대역 3가지: elementsFromPoint 스텁, 가짜 element.animate, MarkdownEditor 모킹.
- T8 둘째와 T9의 편집기는 flush 훅을 등록하는 흉내다. 실제 Milkdown flush는 vitest에서 돌리지 않았다.
- T8 둘째의 창 닫기는 MemoExpandDialog close와 같은 순서(commitTitle, setExpandedCard(null))를 스토어로 불렀다. 대화상자를 렌더하지 않았다.

**브라우저 확인** — 에이전트가 돌리지 않았다. 확인 안 됨.
- [ ] T4 편집기 쪽: 펼친 창에서 ' 끝'을 치고 cmd+z 3번이면 ' 끝'이 사라지고 편집 전 글이다.
- [ ] 펼친 창에서 치고 0.2초 안에 Esc로 닫아도 마지막 글자가 남는다. 이어서 캔버스 cmd+z 1번에 편집 전 글로 돌아간다.
- [ ] 펼친 창 편집기 flush가 리스너와 같은 글을 두 번 쓰지 않는다.
