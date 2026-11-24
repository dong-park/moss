# n2-ime-guard — T10·T11·T9 한글 조합 판정 공용 함수와 전 입력 적용

> 자기완결 브리프. `spec/glass-wall/korean-search-ime/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

**agent**: runner
**id**: KS-2
**상위**: spec/glass-wall/korean-search-ime/spec.md
**deps**: 없음
**상태**: 끝남
**담당 행**: T9, T10, T11

## 문제

한글을 조합하다 Enter를 누르면 입력 칸 대부분이 조합 확정 전에 저장해서 글자가 두 번 들어가거나 잘린다.

## 목표

한글 조합 중인지를 판정하는 공용 함수가 하나 있고, Enter·blur로 저장하는 모든 입력이 그것을 쓴다. 날 `e.key === "Enter"` 비교가 새로 생기면 테스트가 실패한다. 담당 행은 T10, T11, 그리고 T9가 쓸 판정 함수다.

## 작업

1. **D6 확정 = A.** 공용 판정 함수를 새 파일 `web/src/components/workspace/ime.ts`에 만든다. `isComposing` 참, 또는 `keyCode === 229`, 또는 직전 `compositionend`에서 짧은 시간 안에 온 Enter를 "조합 중"으로 본다. 마지막 조건은 Safari가 조합 끝 직후 Enter를 한 번 더 보내는 경우를 거른다. 시간 창 수치는 테스트로 고정한다.
2. `isImeEnter(e)` 같은 한 줄 판정과, 필요하면 `compositionend` 시각을 기억하는 작은 훅을 낸다.
3. 아래 입력의 Enter 처리를 전부 공용 함수로 바꾼다. 조합 중이면 아무것도 하지 않는다.
   `BoardPicker.tsx` 107, `cards/board/Content.tsx` 112, `cards/frame/Content.tsx` 86, `cards/frame/skins/ColumnsSkin.tsx` 93, `cards/_shared/editable.tsx` 39, `cards/_shared/MemoTitleRow.tsx` 97, `cards/_shared/editor/BlockMenu.tsx` 313·325, `cards/photo/Content.tsx` 104, `connectors/ConnectorLayer.tsx` 107, `table/MemoTable.tsx` 225·383, `cards/text/TodoFace.tsx` 93·135, `useCardFlowShortcuts.ts` 31.
4. T11: blur로 저장하는 입력은 조합 중에 blur가 오면 `compositionend` 뒤의 확정 값으로 저장한다. 마지막 글자가 잘리거나 겹치지 않는다. 대상은 위 목록 중 `onBlur` 저장이 있는 칸과 `cards/text/LinkInputFace.tsx` 53.
5. 검사 테스트를 둔다. `web/src/components` 아래 `.tsx`·`.ts`에서 `key === "Enter"`를 공용 함수 없이 쓰는 줄을 찾으면 실패한다. 허용 목록은 이유를 주석으로 적는다.
6. 포스트잇 본문 편집기(Milkdown)는 고치지 않는다. 재현 여부는 n6이 실브라우저에서 본다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/components/workspace/__tests__/ime.test.ts` 통과. 판정 함수 단위 테스트(조합 중 Enter 무시, 229 무시, compositionend 직후 Enter 무시, 평소 Enter 통과)와 날 Enter 검사 테스트가 들어 있다
- [ ] 위 입력 중 최소 `MemoTitleRow`·`BoardPicker`·`editable`에 대해 "조합 중 Enter는 저장을 부르지 않는다" 테스트가 있다
- [ ] `cd web && npx vitest run` 에서 새 실패 0 (메모리의 상존 실패 `Canvas.virtualization.test.tsx`는 제외하고 기록)
- [ ] `cd web && npx tsc --noEmit` 0, `cd web && npx eslint` 새 오류 0
- [ ] 실경로: jsdom 합성 이벤트로만 green이다. 실제 입력기 확인은 n6 몫이라고 구현 메모에 적는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/ime.ts` | 새로 만든다 |
| `web/src/components/workspace/cards/text/TodoFace.tsx` | 지금 유일하게 `isComposing`을 보는 곳 — 공용 함수로 바꾼다 |
| `web/src/components/workspace/BoardPicker.tsx` | 벽 이름 |
| `web/src/components/workspace/cards/_shared/MemoTitleRow.tsx` | 포스트잇 제목 |
| `web/src/components/workspace/cards/_shared/editable.tsx` | 공용 편집 칸 |
| `web/src/components/workspace/cards/frame/Content.tsx` | 메모판 이름 |
| `web/src/components/workspace/cards/frame/skins/ColumnsSkin.tsx` | 메모판 칸 이름 |
| `web/src/components/workspace/cards/board/Content.tsx` | 보드 카드 이름 |
| `web/src/components/workspace/cards/photo/Content.tsx` | 사진 캡션 |
| `web/src/components/workspace/cards/_shared/editor/BlockMenu.tsx` | 블록 메뉴 입력 |
| `web/src/components/workspace/connectors/ConnectorLayer.tsx` | 연결선 라벨 |
| `web/src/components/workspace/table/MemoTable.tsx` | 표 칸 |
| `web/src/components/workspace/cards/text/LinkInputFace.tsx` | 링크 입력 blur |
| `web/src/components/workspace/useCardFlowShortcuts.ts` | mod+Enter |

## 구현 메모

- **판정 함수** `web/src/components/workspace/ime.ts`: `isComposingKey`(isComposing·keyCode 229), `isImeEnter`(조합 중 + 직전 compositionend 100ms 안), `isCommitEnter`(저장해도 되는 진짜 Enter). 모든 입력은 날 `"Enter"` 비교 대신 `isCommitEnter`를 쓴다. compositionend 시각은 문서 capture 리스너 하나가 기억해, 입력마다 핸들러를 달지 않는다. 시간 창 100ms는 `IME_ENTER_GUARD_MS`, 테스트가 경계(99ms 막음·100ms 통과)를 고정한다.
- **blur(T11)**: `useImeSafeBlur`가 조합 중 blur를 compositionend 뒤 한 틱(setTimeout 0)으로 미루고, 그 사이 다시 그려진 최신 핸들러를 부른다. compositionend가 끝내 안 오면 300ms 뒤 부른다. 대상: BoardPicker, board·frame·ColumnsSkin·photo·textbox 카드, editable(EditableLine·EditableBlock), MemoTitleRow, ConnectorLayer 라벨, MemoTable 제목 칸, TodoFace, LinkInputFace.
- **Enter 교체**: 브리프 목록 전부 + 브리프에 없던 `textbox/Content.tsx` blur. `TodoFace`의 `isComposing` 직접 검사도 공용 함수로 바꿨다.
- **검사 테스트**: `__tests__/ime.test.ts`가 `web/src/components` 아래 소스에서 `"Enter"` 글자 줄을 찾아 실패시킨다. 허용은 `ime.ts` 자신과 `cards/_shared/editor/wikilink.ts`(ProseMirror handleKeyDown — Milkdown 영역, 브리프 6항에 따라 안 고침) 둘, 이유는 코드 주석.
- **검증 갭(정직하게)**: 전부 jsdom 합성 이벤트다. 실제 macOS 한글 입력기에서 Safari·Chrome가 보내는 이벤트 순서(특히 blur와 compositionend의 선후)는 n6이 실브라우저로 본다. 본문 Milkdown 편집기와 T12는 손대지 않았다.
- **결과**: tsc 0, 전체 vitest 181파일 1487 통과(8 skip — 이번엔 `Canvas.virtualization.test.tsx`도 통과), eslint 새 오류 0(상존: `ExportModal.tsx:39`, `network.ts:14`, `googleIdentity.ts:91`).
