# n2-editor-history — 메모 편집기에 글자 단위 되돌리기를 붙인다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-2
**상위**: spec/cmd-z-undo/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T2, T3
**사람 확인**: 불필요

## 문제

- 메모 편집기에 되돌리기 기록 플러그인이 없어 cmd+z가 아무 일도 안 한다.
- BlockMenu.tsx:16 주석은 되돌리기가 있다고 가정한다.

## 목표

메모를 편집하는 동안 cmd+z는 방금 친 글자를, cmd+shift+z는 되돌린 글자를 다시 살린다. 편집기를 열자마자 누른 cmd+z는 본문을 바꾸지 않는다.

## 작업

1. `web/package.json` dependencies에 `"@milkdown/plugin-history": "^7.23.0"`을 넣고 web에서 `bun install`을 돌린다. `web/bun.lock` 변경을 같은 커밋에 넣는다.
2. `web/src/components/workspace/cards/_shared/editor/extensions.ts`의 editorPlugins에 history 플러그인을 넣는다. 기존 keymap과 부딪치지 않는지 본다.
3. T2·T3 then 칸의 「확인」을 vitest로 만든다. 새 파일은 `web/src/components/workspace/cards/_shared/editor/__tests__/history.test.ts(x)`. 기존 EditorRegion.test.tsx 방식으로 실제 편집기를 띄운다. 띄울 수 없으면 플러그인 등록과 명령 동작을 ProseMirror 수준에서 시험하고, 구현 메모에 "브라우저 확인 필요"를 적는다.
4. BlockMenu로 블록 하나를 넣은 뒤 cmd+z 1번에 그 블록만 사라지는지 같은 테스트 파일에서 본다.
5. 캔버스 키 처리(Canvas.tsx)는 고치지 않는다. 그 일은 n3이다.

## 완료 기준

- [ ] T2, T3 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/components/workspace/cards/_shared/editor/__tests__`
- [ ] 블록 삽입 1번이 cmd+z 1번에 사라진다. 같은 명령
- [ ] `cd web && npx tsc --noEmit` 통과
- [ ] `web/package.json`과 `web/bun.lock` 둘 다 커밋에 들어 있다. 확인: `git show --stat HEAD -- web/package.json web/bun.lock`
- [ ] 실경로: 테스트가 실제 editorPlugins 배열을 import해서 쓴다. 우회했으면 구현 메모에 갭을 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/package.json` | 의존성 추가 |
| `web/src/components/workspace/cards/_shared/editor/extensions.ts` | editorPlugins :133 |
| `web/src/components/workspace/cards/_shared/editor/BlockMenu.tsx` | :16 주석, 블록 삽입 |
| `web/src/components/workspace/cards/_shared/editor/__tests__/EditorRegion.test.tsx` | 편집기 테스트 방식 |
| `web/node_modules/@milkdown/plugin-history` | 7.23.0 이미 설치됨 |

## 구현 메모
