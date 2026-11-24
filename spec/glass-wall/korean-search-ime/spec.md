# 한글 초성 검색과 한글 입력 중복 막기

| 항목 | 값 |
|---|---|
| 문제 | 한국 사용자가 초성으로 포스트잇을 못 찾고, 한글을 치다 Enter를 누르면 글자가 두 번 들어가 떠난다 |
| 상위 | spec/glass-wall/README.md |
| 상위문제 | 손으로 쓰고 붙이며 공간에 생각을 펼치고 싶은 사람에게 맞는 개인용 벽이 없다 — 화이트보드 도구는 팀용이라 과하고, 메모앱은 시각적이지 않고, 종이와 포스트잇은 흩어져 다시 못 찾는다 |
| 상태 | 진행 |
| 시작 | 2026-10-11 |
| ID 머리 | KS |
| 우선순위 | P0 |
| 시안 | spec/glass-wall/mockups/09-search.png |

## 문제 — 붙인 포스트잇을 한국어 방식으로 다시 못 찾는다

한국 사용자는 검색 칸에 초성부터 친다. 지금 검색은 글자 그대로만 맞춰서 `ㅇㅈ`으로는 아무것도 안 나온다. 또 지금 보는 벽 안에서만 찾아서, 다른 벽에 붙인 포스트잇은 다시 못 찾는다. 한글을 조합하다 Enter를 누르면 글자가 두 번 들어가는 입력 칸도 남아 있다. 리서치는 이 둘을 한국 사용자가 처음 써 보고 바로 떠나는 조건으로 꼽았다.

## 목표 — ⌘K 한 번으로 모든 벽의 포스트잇을 초성으로 찾고 그 자리로 간다

⌘K를 누르면 검색 창이 뜨고, 초성이나 글자 일부로 모든 벽의 포스트잇을 찾는다. 결과를 고르면 그 벽으로 날아가 포스트잇이 반짝인다. 벽의 모든 입력 칸은 한글 조합 중 Enter나 다른 곳 누르기에 글자를 두 번 넣지 않는다.

## 비목표 — 손글씨 읽기와 휴대폰 검색은 이 티켓 밖이다

- **마카 글씨 검색.** 마카로 쓴 글자를 글자로 읽지 않는다. 줄기 비목표이고, 창 아래 안내 줄로 알리기까지만 한다.
- **의미 검색.** AI로 비슷한 뜻을 찾지 않는다. remove-ai가 AI 코드를 지운다.
- **휴대폰 검색 창.** 휴대폰 벽 보기는 phone-to-wall 몫이다. 이 티켓은 데스크톱과 태블릿 키보드 입력까지만 다룬다.
- **멀리서 본 벽의 강조 모양.** 축소한 벽에서 반짝임이 어떻게 보일지는 wall-zoom과의 경계까지만 맞춘다.
- **정규식, 태그, 필드 검색.** 넣지 않는다.

## 성공 기준 — 행 파일이 곧 성공 기준이다

행 파일이 곧 성공 기준이다. 작업 행 14개와 결정 행 8개가 `rows/`에 있다.

## 경계 조건 — 짧은 검색어, 큰 벽, 조합 중 입력이 가장 위험하다

- **빈 검색어와 공백.** 비우면 결과 목록이 사라지고 안내 줄만 남는다. 공백으로 나눈 낱말은 모두 맞아야 결과에 들어간다.
- **한 글자 초성.** `ㅇ` 하나도 맞추지만 결과 줄 수에 상한을 둔다. 상한은 D8이 정한다.
- **된소리와 겹받침.** `ㄲ`은 `까`의 초성으로 맞고 `ㄱ`과는 다르다. 겹받침은 초성 검색에 영향을 주지 않는다.
- **섞인 글.** 영문은 대소문자를 가리지 않는다. 숫자와 기호는 글자 그대로 맞춘다.
- **큰 벽.** 벽 10장과 포스트잇 2,000장에서도 한 글자마다 16ms 안에 결과가 바뀐다.
- **공유 벽.** 공유한 벽도 이 기기에 있는 포스트잇은 찾는다. 서버에 묻지 않는다.
- **찾다가 벽이 사라짐.** 결과를 고르는 사이 그 포스트잇이 지워졌으면 창을 닫고 지금 벽에 머문다.
- **조합 중 입력.** Safari는 조합이 끝난 직후에도 Enter를 한 번 더 보낸다. 이 Enter도 확정용으로 거른다.
- **조합 중 다른 곳 누르기.** 마지막 글자는 한 번만 남는다. 잘리지도 겹치지도 않는다.

## 기술 결정 — 기존 메모 검색 함수를 넓히고, 조합 판정은 한 곳에 둔다

- **기존 검색 위에 올린다.** 평문 만들기와 캐시는 그대로 쓰고, 초성 분해와 칠할 구간 계산을 더한다. 다시 만들지 않는 이유는 제목·본문·사진 캡션 처리 규칙이 이미 테스트로 굳어 있어서다.
- **다른 벽으로 가는 길은 이미 있다.** 표 보기에서 다른 벽 메모를 여는 동작이 있어 그것을 쓴다.
- **조합 판정은 공용 함수 하나로.** 지금은 할 일 카드 한 곳만 조합 중 Enter를 거른다. 흩어진 입력을 하나씩 고치면 새 입력에서 다시 빠진다. 결정은 D6이다.
- **초성 계산은 한글 음절 코드 범위로 한다.** 외부 라이브러리를 들이지 않는다. 표가 19칸이라 직접 쓰는 편이 가볍다.

## 확인 안 된 것 — 어느 입력이 실제로 두 번 들어가는지 아직 재보지 않았다

- moss에서 한글이 두 번 들어간 사례 기록은 찾지 못했다. 입력 칸 대부분이 Enter를 조합 검사 없이 받는 것만 코드로 확인했다. 어느 칸이 실제로 재현되는지는 macOS 한글 입력기로 Safari와 Chrome에서 직접 쳐 봐야 안다.
- 포스트잇 본문 편집기는 조합을 스스로 처리하는 편집기 위에 있다. 본문에서도 중복이 나는지는 확인하지 않았다.
- 표 보기 검색과 이 창이 같은 검색 함수를 쓰게 될지는 정하지 않았다. 표 보기는 다른 티켓이 건드리지 않는 한 그대로 둔다.

## 읽는 순서 — 왜는 위 절, 일은 노드 브리프

| 알고 싶은 것 | 볼 곳 |
|---|---|
| 왜 하나 | `## 문제` |
| 무엇이 끝나면 되나 | `## 목표`, `rows/` |
| 어디까지 왔나 | 아래 노드 표의 상태 열 |
| 한 노드의 일 | 노드 브리프 `nN-*.md` |

실행은 `/go spec/glass-wall/korean-search-ime/spec.md`다. 노드 표가 `pharos graph-run` 선언 그대로다. deps 없는 노드 n1·n2·n5는 동시에 뜬다.

## 공통 완료 기준 — 타입·테스트·린트가 깨끗하고 실경로를 탄다

1. `cd web && npx tsc --noEmit` 0
2. `cd web && npx vitest run` 새 실패 0. 상존 실패 `Canvas.virtualization.test.tsx` 1건은 제외하고 결산에 적는다
3. `cd web && npx eslint` 새 오류 0. 상존 `ExportModal.tsx:39`·`exportStore.ts:51`은 제외한다
4. 새 로직마다 테스트 최소 1개, Conventional Commits
5. 실경로 검증: stub이나 직접 주입으로만 green이면 갭을 결산에 적는다
6. 결정 D1~D8은 모두 추천 A로 닫혔다. 노드 브리프에 확정 답으로 박혀 있다

## DAG — 매칭·입력 판정·이동을 나란히 만들고 창에서 합친다

```
n1-chosung-match ──► n3-all-walls-index ──┐
                                          │
n2-ime-guard ─────────────────────────────┼──► n4-search-panel ──► n6-browser-check
        │                                 │                              ▲
n5-jump-flash ────────────────────────────┘                              │
        └────────────────────────────────────────────────────────────────┘
                                                           (n2 ──► n6)
```

critical path: n1 → n3 → n4 → n6, 길이 4. 노드 6개라 4 < 6이다.

edge 사유:

- n1 → n3: n3가 n1의 초성 매칭 함수와 칠할 구간 계산을 모든 벽 결과에 쓴다.
- n3 → n4: n4가 n3의 모든 벽 결과 함수로 결과 줄과 벽 이름, "N개 더"를 그린다.
- n2 → n4: n4가 검색 입력의 Enter를 n2의 공용 조합 판정 함수로 거른다 (T9).
- n5 → n4: n4가 결과를 고를 때 n5의 이동·반짝임 액션을 부른다.
- n4 → n6: n6이 n4의 검색 창으로 T1·T2·T5·T9를 실브라우저에서 해 본다.
- n2 → n6: n6이 n2가 고친 제목·벽 이름·라벨 입력으로 T10·T11을 해 본다.

커버리지:

| 행 | 노드 |
|---|---|
| T1 ⌘K 창 | n4, n6 |
| T2 초성 | n1, n6 |
| T3 혼합·부분 | n1 |
| T4 벽 이름 | n3, n4 |
| T5 날아가 반짝 | n5, n6 |
| T6 안내 줄 | n4 |
| T7 마카 글씨 없음 | n4 |
| T8 화살표·Esc | n4 |
| T9 검색 창 한글 Enter | n2, n4, n6 |
| T10 제목·라벨 한글 Enter | n2, n6 |
| T11 조합 중 blur | n2, n6 |
| T12 본문 한글 Enter | n6 |
| T13 성능 | n3 |
| T14 순수 함수 | n1 |

## 노드 인덱스

| ID | 브리프 | deps | 상태 |
|---|---|---|---|
| n1 | [n1-chosung-match.md](n1-chosung-match.md) | — | 아직 안 함 |
| n2 | [n2-ime-guard.md](n2-ime-guard.md) | — | 아직 안 함 |
| n3 | [n3-all-walls-index.md](n3-all-walls-index.md) | n1 | 아직 안 함 |
| n4 | [n4-search-panel.md](n4-search-panel.md) | n2, n3, n5 | 아직 안 함 |
| n5 | [n5-jump-flash.md](n5-jump-flash.md) | — | 아직 안 함 |
| n6 | [n6-browser-check.md](n6-browser-check.md) | n2, n4 | 아직 안 함 |

## 파킹 / 보류 로그

| 날짜 | 노드 | 사유 |
|---|---|---|
| | | |

## 구현 메모

- 다른 티켓과 겹침: phone-to-wall(휴대폰 검색 없음), wall-zoom(축소 시 반짝임 모양), wall-marker(마카 획은 검색 대상 아님). 이 티켓은 그 경계까지만 다룬다.
- 기존 검색: `web/src/state/memoSearch.ts` — `plainText`·`plainTextRaw`·`searchMemos`, 평문 LRU 캐시 2000. 대상 kind는 `text`·`textbox`·`photo`, 제목 포함(FEAT-memo-title AC-8). 초성 흔적 없음.
- 기존 UI: `web/src/components/workspace/MemoSearchLayer.tsx` — Cmd/Ctrl+F로 열기, 디바운스 150ms, `filterByKeyword`로 지금 벽 강조·흐림, 결과 클릭 시 `panToCard`. 지금 벽 `cards`만 본다. 폭 `w-72`, 상단 고정. 시안은 폭 560px 가운데 시트.
- 원 스펙: `docs/specs/FEAT-memo-fulltext-search.md` AC-1~4.
- 다른 벽 이동: `state/workspace.ts` `openCardOnCanvas(noteId)` — Dexie에서 `boardId` 읽고 `setCurrentBoard` 후 `panToCard`. 벽 글 읽기는 `state/storage.ts` `loadCards(boardId)`가 `db.notes.where("boardId")`. 휴지통은 별도 `trash` 테이블이라 `notes`에는 지운 메모가 없다.
- 벽 이름: `storage.loadBoards()`.
- 조합 검사가 있는 유일한 곳: `cards/text/TodoFace.tsx` 93·135행 `e.nativeEvent.isComposing`.
- 조합 검사 없이 Enter를 받는 곳: `BoardPicker.tsx` 107, `cards/board/Content.tsx` 112, `cards/frame/Content.tsx` 86, `cards/frame/skins/ColumnsSkin.tsx` 93, `cards/_shared/editable.tsx` 39, `cards/_shared/MemoTitleRow.tsx` 97, `cards/_shared/editor/BlockMenu.tsx` 313·325, `cards/photo/Content.tsx` 104, `connectors/ConnectorLayer.tsx` 107, `table/MemoTable.tsx` 225·383, `cards/text/LinkInputFace.tsx` 53(blur), `useCardFlowShortcuts.ts` 31(mod+Enter).
- 본문 편집기: `cards/_shared/MarkdownEditor.tsx` Milkdown(ProseMirror).
- Safari 조합 끝 Enter: `compositionend` 뒤 `keydown` Enter가 `isComposing=false`, `keyCode 229`로 온다. 공용 판정은 `isComposing || keyCode === 229`와 직전 `compositionend` 타임스탬프를 함께 본다.
- 시안 값: 결과 줄 왼쪽 색 네모는 포스트잇 색, 칠한 구간 배경 노랑, 고른 줄 배경 `#eef3fd` 근방, 안내 줄 12px `#999`, 입력 22px, 커서 색 `#2457b8`. 생성 소스 `mockups/gen.py` 173행.
- i18n 새 키 후보: `search.hint`("초성·부분 일치 · 마카 글씨는 검색하지 않아요"), `search.empty`("찾는 포스트잇이 없어요"), `search.more`.
- 다른 티켓 선행: 없음. 맞닿는 곳만 있다. wall-zoom은 축소한 벽의 반짝임 모양을, glass-surface는 창 뒤 유리벽 흐림을 맡는다. 둘 다 이 티켓 노드를 막지 않는다.
- T12는 고칠 노드가 없다. n6에서 재현되면 본문 편집기 노드를 새로 만든다.
