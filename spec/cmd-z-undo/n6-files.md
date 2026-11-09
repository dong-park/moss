# n6-files — 판과 사진 파일을 되돌리고, 전체 검사를 돌린다

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다. spec.md는 고치지 않는다.

**agent**: runner
**id**: CZ-6
**상위**: spec/cmd-z-undo/spec.md
**deps**: n5, n2
**상태**: 아직 안 함
**담당 행**: T16, T17, T18, T19, T26
**사람 확인**: 불필요

## 문제

- 판을 지우면 휴지통에도 안 가고 배경 사진 파일까지 바로 지워진다.
- 판 배경을 바꾸면 옛 파일이 저장 직후 지워져 되돌릴 수 없다.

## 목표

판 삭제와 배경 교체를 되돌리면 판과 사진이 돌아온다. 사진 파일은 보드 문서, 남은 기록 단계, 휴지통 행 어디에서도 안 가리킬 때만 지워진다. 함 카드 삭제는 단계가 아니다. web 검사 5개가 통과한다.

## 작업

1. undo.ts 단계 meta에 그 단계가 되살릴 수 있는 사진 파일 ref를 적는다. 파일 규칙 검사 함수 하나를 둔다.
2. workspace.ts deleteFrame :2951-2980, setFrameBackground :2894-2927, clearFrameBackground :2929-2949: 옛 파일을 바로 지우지 않는다. 멤버 쓰기와 문서 삭제를 한 트랜잭션으로 묶는다.
3. 청소는 깊이 상한으로 빠짐, 다시 실행 버림, 보드를 떠날 때, 보드 삭제, 로그아웃에서 돈다. storage.ts purgeTrash :482도 파일 규칙을 쓴다.
4. 함 카드 삭제가 단계가 아님을 확인한다. 함 삭제 직후 cmd+z는 그 전 동작을 되돌린다.
5. 행마다 vitest. 새 파일 `web/src/state/__tests__/undo.files.test.ts`. 기존 frameBackground.test.ts 방식으로 파일 삭제 호출을 센다.
6. 마지막에 web 검사 5개를 돌린다. 실패하면 이 브랜치가 만든 원인만 고친다. 플래키 테스트는 같은 명령으로 2번 더 돌려 결과를 구현 메모에 남긴다.

## 완료 기준

- [ ] T16, T17, T18, T19 then 칸의 「확인」이 통과한다. 확인: `cd web && bunx vitest run src/state/__tests__/undo.files.test.ts`
- [ ] 기존 회귀: `cd web && bunx vitest run src/state/__tests__/frameBackground.test.ts src/state/__tests__/frames.test.ts src/state/__tests__/subcanvas.test.ts src/state/__tests__/trash.test.ts src/state/__tests__/undo.trash.test.ts` 통과
- [ ] T26: `cd web && npx tsc --noEmit && bun run lint && bun run test && bun run check:i18n && bun run build` 통과
- [ ] 실경로: 테스트가 실제 deleteFrame, setFrameBackground, purgeTrash 경로를 탄다. 우회했으면 구현 메모에 갭을 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/ydoc/undo.ts` | 단계 meta, 청소 |
| `web/src/state/workspace.ts` | 파일 삭제 함수 :320-332, setFrameBackground :2894-2927, clearFrameBackground :2929-2949, deleteFrame :2951-2980 |
| `web/src/state/storage.ts` | purgeTrash :482-516, purgeAttachments |
| `web/src/state/db/opfs.ts` | deleteBlob |
| `web/src/state/__tests__/frameBackground.test.ts` | 파일 테스트 방식 |
| `.github/workflows/ci.yml` | 검사 5개 |

## 구현 메모
