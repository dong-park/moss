# n1-verify — 먼저 확인: 확인 안 된 것 11가지

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다.

**agent**: general-purpose
**id**: CZ-1
**상위**: spec/cmd-z-undo/spec.md
**deps**: 없음
**상태**: 끝남
**담당 행**: T1
**사람 확인**: 불필요

## 문제

- 스펙의 11가지 사실은 아직 코드로 확인하지 않았다.
- 틀린 사실 위에 구현을 쌓으면 n3 이후 노드가 다시 고쳐야 한다.

## 목표

spec.md 「확인 안 된 것」 1~11마다 맞음·틀림·확인 안 됨과 근거 줄이 이 파일 `## 구현 메모`의 「T1 확인 결과」에 한 줄씩 남는다. 틀린 항목은 영향을 받는 작업 행 id를 함께 적는다.

## 작업

0. 시작 때 `mkdir -p /private/tmp/claude-501/-Users-dongpark-moss/38916d25-fc9a-486f-8d3c-dcacfa292354/scratchpad/n1 && git status --short > /private/tmp/claude-501/-Users-dongpark-moss/38916d25-fc9a-486f-8d3c-dcacfa292354/scratchpad/n1/status-before.txt`를 레포 루트에서 돌린다.
1. 1~5, 7~10은 코드를 읽거나 짧은 node 스크립트(.mjs)로 확인한다. T1 when의 "짧은 vitest"는 이 node 스크립트로 대신한다. web/vitest.config.ts의 include가 `src/**`라 레포 밖 vitest 파일을 모으지 않기 때문이다. 스크립트는 모두 절대경로로 불러온다. y-indexeddb는 dist에 cjs만 있으므로 yjs도 cjs로 맞춘다: `createRequire`로 `/Users/dongpark/moss/web/node_modules/yjs/dist/yjs.cjs`와 `/Users/dongpark/moss/web/node_modules/y-indexeddb/dist/y-indexeddb.cjs`를 require한다. "Yjs was already imported" 경고가 나면 두 벌이 섞인 것이다. IndexedDB가 필요하면 `/Users/dongpark/moss/web/node_modules/fake-indexeddb/auto/index.js`를 먼저 require한다. 스크립트는 레포 밖 `/private/tmp/claude-501/-Users-dongpark-moss/38916d25-fc9a-486f-8d3c-dcacfa292354/scratchpad/n1/`에만 둔다. 레포의 제품 코드와 테스트는 고치지 않는다.
2. 6은 레포가 jsdom에서 실제 Milkdown·ProseMirror 뷰를 띄우는지 확인한다. 근거 후보: `web/src/components/workspace/cards/__tests__/MemoBlocks.test.tsx:18-22`, `web/src/components/workspace/cards/__tests__/MemoExpand.test.tsx:12`, EditorRegion.test.tsx. 띄우지 않으면 "틀림"이고 영향 행은 T2, T3, T4다.
3. 10은 yjs로 10KB 문자열을 300번과 600번 쓴다. UndoManager가 있을 때와 없을 때를 둘 다 잰다. 잴 값은 셋이다: 메모리 encodeStateAsUpdate 크기, y-indexeddb에 저장된 바이트, 새 Doc에 다시 불러온 뒤 encode 크기. y-indexeddb는 갱신이 500개에 닿으면 1초 동안 쓰기가 없을 때 압축한다(y-indexeddb.js:108-116). 저장 바이트는 마지막 쓰기 뒤 실제 시간으로 1.5초 이상 기다린 뒤 잰다. 가짜 타이머를 쓰지 않는다. 판정: 다시 불러온 뒤 encode 크기가 기록 없음과 같으면 맞음이다. 숫자 12개를 결과 줄에 모두 적는다.
4. 11은 ego-browser 같은 브라우저 도구로 몰 수 있으면 macOS Chrome과 Safari에서 한국어 2벌식으로 cmd+z와 cmd+shift+z keydown의 e.key·e.code를 찍는다. 몰 수 없으면 "확인 안 됨"과 몰 수 없던 이유를 적는다. 스펙은 e.code KeyZ도 받으므로 막힘이 아니다. "확인 안 됨"은 11번에만 쓸 수 있다.
5. 결과를 이 파일 `## 구현 메모` 아래 「T1 확인 결과」에 11줄로 쓴다. 형식: `N. 맞음|틀림|확인 안 됨 — 근거 파일:줄 또는 명령 출력 한 줄 — 영향 행`. 10번의 숫자 12개와 11번의 브라우저별 e.key·e.code 값은 그 줄 바로 아래에 `   - ` 들여쓴 글머리로 덧붙인다.
6. 틀린 항목마다 영향 행의 given을 어떻게 고칠지 한 줄로 제안한다. 행 파일과 spec.md는 고치지 않는다. 메인이 이 결과를 spec.md 구현 메모 「T1 확인 결과」로 옮기고 행을 고친다.

## 완료 기준

- [ ] 「T1 확인 결과」에 11줄이 있고 줄마다 판정과 근거가 있다. 확인: `rg -c "^[0-9]+\. (맞음|틀림|확인 안 됨)" spec/cmd-z-undo/n1-verify.md` 가 11
- [ ] 1~10번에는 "확인 안 됨"이 없다. 확인: `rg -c "^([1-9]|10)\. 확인 안 됨" spec/cmd-z-undo/n1-verify.md` 가 0 또는 출력 없음
- [ ] 틀린 항목마다 given 고침 제안이 있다
- [ ] 레포에서 바뀐 것은 이 브리프 하나다. 확인: `diff <(git status --short) /private/tmp/claude-501/-Users-dongpark-moss/38916d25-fc9a-486f-8d3c-dcacfa292354/scratchpad/n1/status-before.txt` 의 차이가 이 파일 줄뿐
- [ ] 실경로: 판정 근거는 레포의 실제 코드 줄이나 실제 yjs·Milkdown 실행 출력이다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `spec/cmd-z-undo/spec.md` | 「확인 안 된 것」 1~11, 「고칠 곳」 줄 번호 |
| `/private/tmp/claude-501/-Users-dongpark-moss/38916d25-fc9a-486f-8d3c-dcacfa292354/scratchpad/cmd-z-facts.md` | 조사 에이전트 보고. 미확인 |
| `web/src/state/workspace.ts` | remove, reflect, 드래그·크기 조절 쓰기 |
| `web/src/state/db/liveSync.ts` | 탭 사이 방송 |
| `web/node_modules/yjs/src/utils/UndoManager.js` | captureTimeout, popStackItem |
| `web/src/components/workspace/cards/_shared/editor/__tests__/EditorRegion.test.tsx` | 편집기 테스트 방식 |
| `web/src/components/workspace/cards/__tests__/MemoBlocks.test.tsx` | jsdom에서 ProseMirror를 피한다는 주석 :18-22 |
| `web/node_modules/y-indexeddb/src/y-indexeddb.js` | 압축 기준 PREFERRED_TRIM_SIZE |
| `web/vitest.config.ts` | include 범위 |

## 구현 메모

### T1 확인 결과

기준 커밋 29255c1. 판정 뜻: 맞음은 스펙·조사 보고의 전제가 코드와 같다는 뜻이고, 질문형 항목은 아래 답이 전제와 같다는 뜻이다. 스크립트는 레포 밖 scratchpad/n1/에 있다(item2·5·6·10.mjs, keylog.html).

1. 맞음 — 지운 카드의 연결선은 보드 문서에 남는다. deleteNote는 notes 맵만 지우고(web/src/state/ydoc/model.ts:188-192), trashNotes는 Dexie connections만 옮긴다(web/src/state/storage.ts:380-415). 문서 connections를 지우는 길은 영구 삭제 hardDeleteNotes뿐이다(storage.ts:355-357) — 영향 행 없음
2. 맞음 — 본문은 마지막 키 뒤 200ms에 한 번 쓰이고, 편집을 마칠 때 본문 추가 쓰기는 없다. 근거: web/node_modules/@milkdown/plugin-listener/src/index.ts:167-187(debounce 200), web/src/state/workspace.ts:2992-3006 setContent, :1435-1441 문서에 바로 쓰기, :3227 setEditing은 set만 한다. node+jsdom 실행(item2.mjs): 키 3번 뒤 350ms에 1회, 마지막 입력 50ms 뒤 destroy하면 쓰기 1회 그대로. 마지막 200ms 입력은 버려진다(index.ts:194 cancel) — 영향 행 없음
3. 맞음 — 획은 포인터를 뗄 때 한 번, overlay 문자열 통째로 문서에 쓴다. 근거: web/src/components/workspace/cards/_shared/useDrawing.ts:105-124, MemoExpandDialog.tsx:154, workspace.ts:3343-3359 setOverlay, :1435-1441. penUndo·penRedo·penClear도 호출마다 한 번 쓴다(:3361-3416) — 영향 행 없음
4. 맞음 — 수정 시각을 읽는 곳은 표 정렬·표시와 내보내기이고 모두 Dexie 미러를 읽는다. 동기화는 읽지 않는다. 근거: memoTable.ts:230,319-320, table/MemoTable.tsx:439, export/markdownExport.ts:77, collectExportData.ts:34-51, 미러 값은 mergeNote가 지금 시각으로 쓴다(storage.ts:171,194), db/liveSync.ts:6 비교 로직 제거. 문서 updatedAt은 카드 쓰기마다 같은 트랜잭션에 실려(workspace.ts:1477, :1520-1536) 되돌리면 옛 값이 되지만 웹은 읽지 않는다. 깨지는 웹 코드는 못 찾았다 — 영향 행 없음
5. 맞음 — captureTimeout은 쓰기 가능한 공개 필드이고 쓰기마다 다시 읽는다. 근거: web/node_modules/yjs/src/utils/UndoManager.js:207,239. 실행(item5.mjs, yjs 13.6.33): 500에서 즉시 2쓰기 1단계, 700ms 뒤 2단계. Infinity로 바꾸면 700ms 간격 2쓰기가 1단계이고 stopCapturing 뒤 새 단계. 500으로 되돌리면 600ms 간격 2단계, 0이면 즉시 2쓰기도 2단계 — 영향 행 없음
6. 틀림 — 레포는 jsdom에서 실제 Milkdown 편집기를 띄우지 않는다. 근거: MemoBlocks.test.tsx:18-22,:60 useInstance 모킹, MemoExpand.test.tsx:12-16 MarkdownEditor 모킹, EditorRegion.test.tsx는 자식에 div를 넣는다. Editor.make를 쓰는 테스트 0건. 다만 node+jsdom(item6.mjs)에서 실제 Editor(commonmark+history)가 떠서 insertText 뒤 undo, ctrl+z keydown, ctrl+shift+z keydown(keyCode 90 필요)으로 글이 돌아왔다. vitest 안에서는 돌리지 않았다 — 영향 행 T2, T3, T4
   - 고침 제안: T2·T3·T4 given에 "실제 Milkdown 편집기를 띄우는 기존 테스트는 없다. 새 테스트가 Editor.make와 commonmark와 history로 jsdom에 띄운다. node+jsdom에서는 됨, vitest는 미확인. 안 되면 EditorView로 대신하고 브라우저 수동 확인으로 넘긴다"를 더한다. jsdom navigator.platform이 빈 값이라 Mod는 ctrl이다. meta+z keydown은 안 먹었다. 시험은 ctrlKey로 한다
7. 맞음 — 표 보기에서는 닿지 않는다. WorkspaceShell.tsx:186 `isCanvas ? <Canvas /> : <MemoTable />`이라 표 보기에서 Canvas가 언마운트되고, 키 리스너는 Canvas 안에서만 건다(web/src/components/workspace/Canvas.tsx:440,443). z 키 처리는 :380 한 곳뿐이다 — 영향 행 없음
8. 맞음 — 옛 파일 매핑은 안 지워진다. files 맵을 쓰는 곳은 추가 setDocFile(web/src/state/ydoc/model.ts:260-265), 실패 표시 쓰기·지우기(share/attachments.ts:142-143,168), 보드 통째 비우기(ydoc/writeThrough.ts:147)뿐이다. 판 배경 교체·제거는 로컬 OPFS 파일만 지운다(workspace.ts:320-331, :2919, :2948, storage.ts:641-649) — 영향 행 없음. 되돌린 배경을 보려면 이 기기 파일이 있어야 하므로 파일 규칙 쪽 일이다
9. 맞음 — 조사 보고의 나머지 항목이 코드와 같다. 단 줄 번호는 어긋난다(resizeCard 2737 → 2713, resizeFrame 2875 → 2844, setTextWidth 3115 → 3098). 드래그: moveCard는 문서에 안 쓰고(workspace.ts:2633-2643), moveSelectedBy는 이동마다 쓰고(:2645-2677), 놓을 때 commitMove가 x,y를 한 트랜잭션으로(:2680-2711, DraggableCard.tsx:891), resolveMembership이 frameId를 카드마다 따로 쓴다(:2765-2795). 크기 조절: mousemove마다 문서에 쓴다(ResizeHandles.tsx:106,173,197). 파일 삭제: 일반 메모는 purgeTrash(storage.ts:482-516), 함은 5초 뒤(workspace.ts:264,1984,2006,3978-3984), 판 배경 교체·제거는 저장 flush 직후(:328-331,2919,2948), 판 삭제는 즉시(:2966). 뷰포트·선택·z순서·lastVisitedAt·lastOpenedAt은 문서에 없다(model.ts:43-62) — 영향 행 없음
10. 맞음 — 다시 불러온 뒤 encode 크기가 기록 없음과 같다. 네 경우 모두 10,059B. 실행(item10.mjs, yjs 13.6.33, y-indexeddb 9.0.12, fake-indexeddb 6.2.7). 저장 바이트는 마지막 쓰기 뒤 실제 1.5초 뒤에 쟀다 — 영향 행 없음
   - 300번 기록 없음: 메모리 10,059B, 저장 3,008,962B(302행), 다시 불러온 뒤 10,059B
   - 300번 기록 있음: 메모리 3,000,959B, 저장 3,008,962B(302행), 다시 불러온 뒤 10,059B
   - 600번 기록 없음: 메모리 10,059B, 저장 10,059B(1행), 다시 불러온 뒤 10,059B
   - 600번 기록 있음: 메모리 6,001,859B, 저장 6,001,859B(1행), 다시 불러온 뒤 10,059B
   - 참고: 600번 직후 바로 잰 저장은 둘 다 6,018,262B(602행)이고 압축 전이다. 절댓값은 스펙 문구(3,001,748 · 10,062 · 6,003,548)와 0.03% 안쪽으로 다르다. 문서 모양 차이이고 경향은 같다. 기록 있음 300번은 압축 전(302행 < 500)이라 저장이 기록 없음과 같다
11. 확인 안 됨 — macOS Chrome과 Safari에서 한국어 2벌식으로 cmd+z를 누르는 일은 이 에이전트가 못 한다. 브라우저 도구의 키 입력은 CDP로 합성한 이벤트라 OS 입력기를 거치지 않고, 입력 소스 전환과 OS 키 입력은 허용 밖이다. 이 기기에 2SetKorean은 켜져 있다. 스펙이 e.code KeyZ도 받으므로 막힘은 아니다 — 영향 행 없음
   - Chrome: 확인 안 됨. Safari: 확인 안 됨
   - 사람이 하려면 scratchpad/n1/keylog.html을 두 브라우저로 열고 한국어 2벌식으로 cmd+z와 cmd+shift+z를 입력칸 안과 밖에서 누른다. 현재 코드는 e.key z·Z만 본다(Canvas.tsx:380)

### T1 추가 발견 (11항목 밖)

- 메모 본문 편집기는 펼친 메모 창에만 있다. 카드 앞면은 제목만 고치고 본문은 읽기 전용이다(web/src/components/workspace/cards/text/Content.tsx:56-60). 편집기를 쓰는 곳은 MemoExpandDialog.tsx:134 하나다. T2·T3·T4·T8·T9 given의 "메모 카드 안에서 편집", "편집기를 열었다"는 펼친 메모 창으로 읽어야 한다. 고침 제안: 그 given들에 "펼친 메모 창(expandedCardId)에서"를 넣는다. 스펙 단계 정의는 expandedCardId를 이미 편집 묶음 주인으로 쓴다.
- 펼친 창을 닫으면 편집기가 destroy되고 마지막 200ms 입력은 문서에 안 쓰인다(항목 2). T9의 "0.05초 안에 편집을 마쳤다"는 이 경우다.
- 문서 updatedAt이 옛 값으로 돌아가면 shared/doc-model/src/index.ts:81이 말한 "updatedAt이 mcpAt보다 크면 다른 곳에서 고쳐졌다" 비교가 틀어질 수 있다. 읽는 코드는 아직 레포에 없다(mcpAt은 주석과 PROVENANCE_FIELDS뿐). 스펙의 되돌린 뒤 updatedAt 지금 시각 쓰기(D3)가 이 위험을 막는다.
- 브리프 작업 0의 status-before 스냅샷 뒤에 메인이 29255c1을 커밋해 n1-verify.md의 " M" 줄이 사라졌다. 이 노드가 고친 것이 아니다.
