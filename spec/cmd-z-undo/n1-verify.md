# n1-verify — 먼저 확인: 확인 안 된 것 11가지

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다.

**agent**: general-purpose
**id**: CZ-1
**상위**: spec/cmd-z-undo/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T1
**사람 확인**: 불필요

## 문제

- 스펙의 11가지 사실은 아직 코드로 확인하지 않았다.
- 틀린 사실 위에 구현을 쌓으면 n3 이후 노드가 다시 고쳐야 한다.

## 목표

spec.md 「확인 안 된 것」 1~11마다 맞음·틀림·확인 안 됨과 근거 줄이 이 파일 `## 구현 메모`의 「T1 확인 결과」에 한 줄씩 남는다. 틀린 항목은 영향을 받는 작업 행 id를 함께 적는다.

## 작업

1. 1~5, 7~10은 코드를 읽거나 짧은 vitest·node 스크립트로 확인한다. 스크립트는 레포 밖 `/private/tmp/claude-501/-Users-dongpark-moss/38916d25-fc9a-486f-8d3c-dcacfa292354/scratchpad/n1/`에만 둔다. 레포의 제품 코드와 테스트는 고치지 않는다.
2. 6은 기존 `web/src/components/workspace/cards/_shared/editor/__tests__/EditorRegion.test.tsx`가 실제 Milkdown 편집기를 띄우는지 보고, 띄운다면 같은 방식으로 plugin-history를 시험할 수 있는지 적는다.
3. 10은 yjs로 10KB 문자열을 UndoManager가 켜진 채 300번 쓰고, encodeStateAsUpdate 결과를 새 Doc에 적용한 뒤 그 Doc의 encodeStateAsUpdate 크기를 잰다.
4. 11은 브라우저를 직접 몰 수 있으면 macOS Chrome에서 한국어 2벌식으로 cmd+z keydown의 e.key·e.code를 찍는다. 몰 수 없으면 "확인 안 됨"으로 적는다. 스펙은 e.code KeyZ도 받으므로 막힘이 아니다.
5. 결과를 이 파일 `## 구현 메모` 아래 「T1 확인 결과」에 11줄로 쓴다. 형식: `N. 맞음|틀림|확인 안 됨 — 근거 파일:줄 또는 명령 출력 한 줄 — 영향 행`.

## 완료 기준

- [ ] 「T1 확인 결과」에 11줄이 있고 줄마다 판정과 근거가 있다. 확인: `rg -c "^[0-9]+\. (맞음|틀림|확인 안 됨)" spec/cmd-z-undo/n1-verify.md` 가 11
- [ ] `git status --short web/` 에 이 노드가 만든 변경이 없다
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

## 구현 메모
