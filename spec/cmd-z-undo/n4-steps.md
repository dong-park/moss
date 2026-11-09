# n4-steps — 동작 하나를 1단계로 묶고, 남의 쓰기와 자동 쓰기를 기록에서 뺀다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-4
**상위**: spec/cmd-z-undo/spec.md
**deps**: n3, n2
**상태**: 아직 안 함
**담당 행**: T4, T6, T8, T9, T10, T20
**사람 확인**: 불필요

## 문제

- 0.5초 묶음만으로는 크기 조절, 편집, 펜 모드가 여러 단계로 쪼개진다.
- 자동 측정, MCP 브리지, 멤버십 동기화의 쓰기가 내 기록에 들어가면 cmd+z가 헛돈다.

## 목표

사용자 동작 하나가 기록 1단계다. 편집 1회, 펜 모드 1회, 크기 조절 1회, 드래그 1회가 각각 1단계다. 기록 안 하는 쓰기 아홉 가지는 기록에 들어가지 않는다.

## 작업

1. n3이 만든 `web/src/state/ydoc/undo.ts` 단계 API를 쓴다. 가장 바깥 동작 진입점에서만 단계를 연다. 기록 안 하는 origin으로 도는 동작(브리지, 멤버십, 자동 측정)은 단계를 열지 않는다. 그래서 내 편집 중 브리지 setContent가 와도 내 편집 단계가 쪼개지지 않는다. 단계를 여는 진입점은 문서에 쓰는 사용자 동작 전부다. 최소 목록: addCardAt :2540, addPhotoAt :2586, addFrameAt :2743, setFrameBackground :2894, clearFrameBackground :2929, deleteFrame :2951, setContent, setTitle, setMemoColor :3044, connectCards :3237, remove :3421, removeSelected :3475, restoreFromTrash :3561, 드래그·크기 조절·편집·펜 모드. 전수는 workspace.ts 스토어 액션 가운데 withActiveDoc·persistCard·persistCardDebounced·storage 쓰기를 부르는 것을 rg로 찾아 구현 메모에 표로 남긴다. 공통 장치(액션 감싸기 함수 하나)로 열어도 된다.
2. 드래그: DraggableCard.tsx mouseup의 commitMove와 resolveMembership을 1단계로 묶는다. 크기 조절: ResizeHandles.tsx 시작~끝을 묶는다.
3. 편집: 카드 안 편집 시작~끝과 펼친 메모 창 열기~닫기를 각각 1단계로 묶는다. 펼친 창은 `web/src/components/workspace/cards/MemoExpandDialog.tsx:137`이 setContent를 바로 부르고 setExpandedCard(workspace.ts:3229-3234)가 editingId를 null로 만든다. 편집을 마칠 때 Milkdown listener의 0.2초 디바운스에 남은 본문을 먼저 내보낸 뒤 단계를 닫는다. 근거 줄은 n1 「T1 확인 결과」 2번.
4. 펜 모드: 들어갈 때~나올 때를 묶는다. 펜 모드 안 cmd+z는 펜 스택 그대로. 근거 줄은 n1 3번.
5. 기록 안 하는 쓰기: setFaceHeight, setTextMeasuredWidth, updatedAt만 바뀐 쓰기, files 맵(`web/src/state/share/attachments.ts`), 보드 사이 옮기기, 함 삭제, 멤버십 동기화(`web/src/state/membership.ts` :172, :183). origin은 n3이 넓힌 `web/src/state/ydoc/model.ts` 헬퍼 인자로 넘긴다. model.ts 밖에서 transactLocal을 직접 부르는 곳은 바깥 호출이 안쪽 헬퍼 인자를 덮으므로 그 호출 자체가 origin을 받는다. 기록 안 하는 대상은 removeSelected :3531(함 쪽)과 attachments.ts :141·:168이다. 전수: `rg -n "transactLocal\(" web/src --glob '!**/__tests__/**' --glob '!**/ydoc/model.ts' --glob '!**/ydoc/origin.ts'` 7곳(마이그레이션 2곳, commitMove :2699, writeThrough :143 포함)을 구현 메모에 표로 남긴다. 기록 안 하는 동작은 안쪽에서 부르는 동작까지 같은 origin으로 돈다. 예: setFaceHeight :3134-3149는 안에서 resolveMembership을 부르고 그 쓰기가 writeCardToDocHandle → model.ts transactLocal로 나간다. 동기 경로는 동작 전체를 기록 안 하는 origin 문맥으로 감싸고, 비동기 경로는 인자로 넘긴다. await 뒤에 문서에 쓰는 길은 모두 인자로 넘긴다. 알려진 길: saveConnection(storage.ts:661-675), 보드 사이 옮기기 moveCardBetweenDocs(workspace.ts:1729, 호출 :3660·:3844·:3908), 멤버십(membership.ts :162·:172·:183), writeToBoardDoc의 await handle.whenLoaded 뒤 쓰기(writeThrough.ts:48-60). 뒤는 await 세 번 뒤 :1761의 withActiveDoc(… deleteNoteDoc …)로 활성 문서에 쓰므로 deleteNoteDoc까지 origin을 인자로 넘긴다. 함 삭제: 함 카드의 문서 삭제는 cascadeDeleteFunnels보다 먼저 remove :3462의 deleteNoteDoc에서 일어난다. 함이면 이 쓰기를 기록 안 하는 origin으로 한다. removeSelected :3530-3534는 함과 일반 메모를 한 트랜잭션으로 지우므로 둘로 나눈다. 함 쪽만 기록 안 하는 origin이다. n3이 이미 맡은 불러오기 정리·시드·빈 글상자 지우기는 다시 하지 않는다.
6. MCP 브리지(`web/src/state/bridge/mossBridge.ts`): 브리지가 부르는 스토어 액션과 storage 쓰기 함수가 origin 옵션을 받아 Y.Doc 쓰기까지 끝까지 넘긴다. 비동기 경로도 같다. 연결선은 connectCards → storage.saveConnection(storage.ts:661-675) → writeConnectionRecord로 await 두 번 뒤에 쓴다. 판정은 동작 테스트로 한다(메인 결정): P의 notes·connections에 쓰는 브리지 명령(notes.create, notes.update, notes.delete, photos.create, frames.create, connections.create, connections.delete. notes.createBoard는 P에 쓰는지 코드로 확인해 넣거나 뺀다)을 지금 보는 보드 P에 실행하고, 실행 전후 P의 undoStack 길이가 같으면 통과다. boards.*는 보드를 바꾸거나 기록 범위 밖이고 ai.*는 문서에 안 써서 뺀다. 명령마다 선택 매개변수를 모두 채운 호출 한 번과 하나씩만 준 호출들을 돌린다(notes.update는 content, title, width·height, x·y, color). connections.create는 양 끝이 P인 분기와 source만 P이고 target이 다른 보드인 분기(mossBridge.ts:668-694, :687 saveConnection 직접 호출)를 둘 다 돌린다. 길이는 명령의 promise를 기다리고 flushAll 뒤 실제 시간 0.1초 이상 지나서 잰다. 구현 때 참고할 호출 위치: ws.* 30곳(`rg -n "\bws\.[A-Za-z]+\(" web/src/state/bridge/mossBridge.ts`), writeThrough 헬퍼 직접 호출 writeNoteRecord :399·:441·:455·:560, writeBoardRecord :559, deleteNoteRecord :472, storeAttachment :187·:202·:215·:493, updateNoteTitle :443(storage.ts:329-340가 문서에 씀), saveConnection :687, removeConnection :702. saveNote :398·:557은 미러만 쓴다(storage.ts:309-318).
7. T4: 편집 중이고 편집기 기록이 비었을 때 cmd+z가 캔버스 기록을 바꾸지 않는다. n3의 undoKeys와 스토어로 캔버스 쪽을 시험한다. 편집기 쪽 판정은 브라우저 확인 항목으로 구현 메모 「브라우저 확인」에 적는다.
8. 행마다 vitest. 새 파일 `web/src/state/__tests__/undo.steps.test.ts`.

## 완료 기준

- [ ] T4 캔버스 쪽, T6, T8, T9, T10, T20 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.steps.test.ts`
- [ ] 글상자를 편집하는 동안 자동 폭·높이 측정 액션을 편집 쓰기 사이마다 다른 값으로 직접 불러도 편집을 마친 뒤 undoStack 길이가 1이고 cmd+z 1번에 편집 전 글로 돌아간다. 기록 안 하는 동작이 단계를 안 여는 분기를 빼면 이 테스트가 실패한다. 실패 출력 한 줄을 구현 메모에 남긴다
- [ ] 위 진입점 목록의 동작마다 정상 입력으로 한 번 부르면 undoStack이 정확히 1 늘어난다. 정상 입력은 지금 보드의 일반 카드다. 함 카드 삭제와 다른 보드 메모 살리기는 0이고 따로 판정한다. 같은 명령의 테스트 이름으로 확인
- [ ] 작업 6의 브리지 명령·매개변수 조합을 P에 실행해도 P의 undoStack 길이가 그대로다. 구현 메모에 명령 이름, 매개변수, 전후 길이 표를 남긴다. 멤버십 쓰기는 P가 시스템 보드일 때 시험한다. 같은 명령의 테스트 이름으로 확인
- [ ] T20 "빼면 실패" 셋을 구현 메모에 실패 출력 한 줄씩 남긴다: 브리지 origin 넘기기를 빼면 넷째·다섯째가, 멤버십 origin을 빼면 둘째가, 기록 안 하는 동작이 단계를 안 여는 분기를 빼면 셋째가 실패한다
- [ ] 함 삭제가 undoStack 길이를 바꾸지 않는다. 같은 명령의 테스트 이름으로 확인
- [ ] 구현 메모에 model.ts 밖 직접 transactLocal 7곳 표, 진입점 표, 「브라우저 확인」 항목이 있다
- [ ] 기존 회귀: `cd web && bunx vitest run src/state/__tests__/undo.core.test.ts src/state/__tests__/membership.test.ts src/state/__tests__/memoHeight.test.ts src/state/__tests__/subcanvas.test.ts src/state/__tests__/penMode.test.ts src/state/__tests__/frames.test.ts` 통과
- [ ] `cd web && npx tsc --noEmit` 통과
- [ ] 실경로: 드래그·크기 조절 테스트가 실제 스토어 액션 순서를 탄다. 우회했으면 구현 메모에 갭을 적는다

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
| `web/src/state/storage.ts` | saveConnection :661-675 |
| `web/src/state/ydoc/model.ts` | 쓰기 헬퍼의 origin 인자(n3이 넓힘) |
| `web/src/state/workspace.ts` | remove :3421-3473(함 문서 삭제 :3462), removeSelected :3475-3547(문서 삭제 :3530-3534) |
| `web/src/state/ydoc/writeThrough.ts` | writeToBoardDoc, 활성 문서 쓰기 :56-58 |
| `web/src/components/workspace/cards/MemoExpandDialog.tsx` | 펼친 창 setContent :137 |
| `web/src/components/workspace/undoKeys.ts` | n3이 만든 키 판정 |
| `web/src/state/membership.ts` | :172, :183 |

## 구현 메모
