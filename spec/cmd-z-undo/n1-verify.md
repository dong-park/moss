# n1-verify — 먼저 확인: 확인 안 된 것 11가지

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다.

**agent**: general-purpose
**id**: CZ-1
**상위**: spec/cmd-z-undo/spec.md
**deps**: 없음
**상태**: 진행
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
