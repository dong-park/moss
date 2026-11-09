# memo-paper-expand

| 항목 | 값 |
|---|---|
| 문제 | 메모를 펼치면 회색 편집 모달이 떠서, 포스트잇이 커지는 게 아니라 다른 편집기로 넘어간 느낌이다 |
| 상위 | 없음 |
| 상위문제 | 없음 |
| 상태 | 아직 안 함 |
| 시작 | 2026-11-10 |

## 문제 — 펼친 창이 메모지가 아니라 편집기처럼 보인다

보드 위 메모는 노란 정사각 포스트잇이다. 더블클릭하면 회색 모달이 뜬다. 모달 머리에는 "메모 편집" 제목, "+ 블록 추가", 펜, 지우개, 닫기가 있고 그 아래에 서식 툴바가 한 줄 더 있다. 사용자가 "실제 메모지가 펴졌으면 한다"고 제보했다.

## 목표 — 펼친 창이 같은 색의 커진 메모지이고 서식은 글자를 긁어서만 바꾼다

펼친 창은 카드 색과 같은 종이 한 장이다. 머리 막대와 상단 서식 툴바는 없다. 글자를 긁으면 뜨는 버블 툴바로만 서식을 바꾼다.

## 비목표 — 카드 앞면·사진 카드·본문 폭 규칙은 건드리지 않는다

- 카드 앞면 모양(paper·todo·link)은 spec/card-faces.md의 범위다. 여기서는 바꾸지 않는다.
- 사진 카드의 PhotoLightbox는 그대로 둔다.
- 본문 컬럼 폭 720px·글자 13px·padding 6/9는 바꾸지 않는다. 이미 저장된 card.overlay 선이 이 컬럼 좌표라서, 바꾸면 기존 선이 펼친 창 안에서 다른 글자 위로 간다. 카드 앞면은 제목만 보이므로 앞면과 정렬하는 문제가 아니다.
- 버블에 링크 URL 입력칸을 새로 만드는 일은 하지 않는다. D4에서 가른다.
- 카드 위치에서 종이 위치로 날아가는 모션은 하지 않는다. D6에서 가른다.
- 움직임 줄이기(prefers-reduced-motion) 처리는 하지 않는다. globals.css에 이 규칙이 0건이라 모든 모달에 없는 기존 상태다.
- 체크한 할 일 글자(--color-text-muted #6a6c72)와 링크 글자(#4575e6)의 종이 위 대비는 다루지 않는다. 노랑 #ffcf6e에서 각각 3.60과 2.92다. 기존 토큰 문제다. 이 스펙의 대비 기준은 기본 본문 글자 --color-text #2c2e33이고 4.5:1 이상이다. multiply 뒤 합성색 기준으로 가장 진한 노랑 #ffcf6e 종이에서 평균 픽셀 약 8.4:1, 가장 어두운 픽셀 약 5.4:1이다.

## 성공 기준 — 행 파일이 곧 성공 기준이다

작업 행 T1~T13이 성공·실패 기준이다. 결정 행 D1~D9는 추천으로 진행한다. 막는 결정은 없다.

## 경계 조건 — 화면 크기와 펜 모드 두 축이 판정을 가른다

- 종이 크기는 폭 min(792px, 94vw) × 높이 min(792px, 86vh)이다. 뷰포트 폭 843px 이상이고 높이 921px 이상이면 792×792 정사각이다. 폭은 843px 미만에서, 높이는 921px 미만에서 줄어든다. 1440×900에서는 792×774다. 기준은 D1이다.
- 종이 안쪽 여백은 종이의 padding이고 12px 24px 40px이다. 스크롤 영역 padding은 0이다. text.png의 투명 가장자리와 말린 모서리를 피한다. 스크롤 영역 폭은 744px이고 컬럼 720px에 스크롤바 여유 24px를 더한 값이다. 이 여유가 스크롤바(최대 약 17px)를 흡수한다. 기준은 T12와 T13이다.
- 뷰포트 폭이 835px 이하이면 스크롤 영역이 737px 아래로 줄어 가로 스크롤이 생길 수 있다. 836px 이상이면 생기지 않는다. 컬럼 폭 720px은 그대로다.
- 제목 줄 30px(MEMO_TITLE_ROW_HEIGHT)이 스크롤 영역 안에 먼저 들어간다. 제목 줄 30px + 본문이 종이 높이 − 52px보다 길면 세로로 스크롤된다. 본문이 종이 높이 − 82px 이하이면 스크롤이 없다. 종이 높이는 뷰포트 높이 921px 미만에서 86vh로 줄어든다.
- 펜이 켜진 동안은 글자를 긁을 수 없다. 버블이 안 떠도 받아들인다.
- 사진 카드는 이 창이 아니라 PhotoLightbox로 간다.
- 할 일·링크·빈 링크 앞면 메모는 더블클릭으로 창이 열리지 않는다. 창이 열리는 길은 메모 표의 열기뿐이다. 기준은 D7과 T7이다.

## 실패 모드 — 버블이 모달 밖 portal이라 가장 먼저 깨진다

1. **버블을 누르면 클릭이 버블을 뚫고 오버레이에 닿아 창이 닫힌다.** 버블은 body 직속 portal이고 Radix 모달이 body에 pointer-events:none을 걸어 버블이 이를 상속한다. 지금 코드를 뷰포트 1710×961에서 실측했다. 버블과 body의 pointerEvents가 'none'이고 B 버튼 중심의 elementFromPoint는 Dialog.Overlay였다. 실제로 누르자 role=dialog가 1개에서 0개로 닫히고 서식은 안 생겼다. Radix가 버블을 바깥으로 판정해서가 아니라 클릭이 버블을 통과해서다. 사용자는 서식을 바꾸기는커녕 쓰던 창이 닫히는 것을 본다. 막는 방법은 D9다. 막는 기준은 T1과 T9다.
2. **종이 폭이나 글꼴이 바뀌어 저장된 펜 선이 엉뚱한 글자 위로 간다.** 선은 card.overlay에 720px 컬럼 좌표로 저장돼 있다. 사용자가 이전에 그은 선이 펼친 창에서 어긋난다. 컬럼 폭 720px·13px·padding 6/9를 그대로 둔다. 기준은 T4다.
3. **녹음·파일을 이 창에서 넣을 수 없다.** 사용자는 블록 추가 메뉴가 사라진 것을 알아챈다. D3에서 받아들이기로 했다. 이유는 사용자가 마크다운 위주를 요청했기 때문이다. 이미 든 블록은 그대로 보인다.
4. **닫기를 못 찾는다.** 머리 막대의 ✕가 사라져 닫는 길이 Esc뿐이 된다. D5에서 종이 밖 ✕와 바깥 클릭을 둔다. 기준은 T6이다.
5. **제목 공백이 닫을 때 확정되지 않는다.** 기존 AC-7이 깨진다. close 함수를 그대로 쓴다. 기준은 T6이다.
6. **세로 스크롤바가 컬럼 폭을 갉아 가로 스크롤이 생긴다.** 사용자는 본문이 좌우로 흔들리는 것을 본다. 스크롤 영역에 여유 24px를 둔다. 기준은 T12다.
7. **스크롤하면 버블이 글자에서 떨어진다.** 버블 좌표는 선택이 바뀔 때만 계산된다. 스크롤하면 현재 선택으로 좌표를 다시 계산해 버블이 글자를 따라가고, 선택이 스크롤 영역의 보이는 범위 밖이면 닫고, 다시 범위 안으로 스크롤하면 다시 연다. 다시 열 뷰는 lastView에서 얻는다. 스크롤마다 닫으면 버블 클릭이 낸 scrollIntoView 스크롤에도 닫혀 B 다음 H1 같은 연속 서식이 끊긴다. 기준은 T3다.

## 기술 결정 — 본문과 펜 구조는 그대로 두고 겉만 바꾼다

- 컬럼 폭 720px·13px·padding 6/9 유지. 이유는 이미 저장된 card.overlay 선이 이 컬럼 좌표라서 바꾸면 기존 선이 다른 글자 위로 가기 때문이다. 카드 앞면에는 제목만 보인다(2026-09-22 사용자 결정, text/Content.tsx 59행·166행).
- 종이는 폭 min(792px, 94vw) × 높이 min(792px, 86vh)이다. 스크롤 영역은 컬럼 720px + 여유 24px = 744px이다. 여유는 스크롤바를 흡수한다. 지금 창 768px의 48px 여유가 하던 일이다. 종이 padding 12px 24px 40px는 text.png의 투명 가장자리와 말린 모서리를 피한다.
- Radix Dialog 유지. 이유는 포커스 가두기와 Esc 처리를 이미 쓰고 있기 때문이다. 제목은 화면에서 숨긴 Dialog.Title로 두고 글자는 카드 제목이나 "메모"로 쓴다. "메모 편집" 글자는 DOM에 두지 않는다.
- MilkdownProvider는 Dialog.Content 레벨 유지. 펜·제목 슬롯이 같은 인스턴스를 쓴다.
- BlockMenu와 MarkdownToolbar는 마운트만 뗀다. 파일과 테스트는 남긴다. 롤백이 쉽다.
- paper 종이는 앞면과 같은 층이다(D7). 종이 루트에 text.png 배경과 isolation:isolate를 주고 같은 mask의 memoTint 층을 multiply로 깐다. 단색 memoTint는 text.png의 종이 결이 빠져 앞면과 색이 달라서 쓰지 않는다. todo·link·linkEmpty 종이는 var(--color-card-base) 단색이다. 색은 창을 열 때 한 번 정해 고정한다. 기준은 T7이다.
- 버블은 body portal을 그대로 두고 pointer-events:auto만 준다(D9). 클릭이 오버레이로 뚫리는 것이 실측된 원인이다. onInteractOutside 가드는 넣지 않는다.
- 열림 모션은 기존 전역 규칙 [data-state=open][data-radix-dialog-content]의 moss-scale-in(200ms, 0.96→1)을 그대로 쓴다(D6, globals.css 241~243행). 이유는 이 규칙이 @layer 밖이라 Tailwind 유틸리티로 덮을 수 없고, 다른 모달과 같게 보이기 위해서다. 새 모션 코드는 넣지 않는다. 움직임 줄이기 처리는 없는 채로 둔다.
- 서식 입구가 버블 하나라 스크롤하면 버블이 글자를 따라간다. bubbleSlot은 선택이 바뀔 때만 좌표를 계산한다. extensions.ts에 refreshBubble(scrollEl: HTMLElement): void를 export한다. extensions.ts 모듈 변수 lastView(bubbleSlot plugin view의 update에서 늘 갱신하고 destroy에서 null로 비운다)의 현재 선택으로 좌표를 다시 계산하고, 선택이 비었거나 scrollEl의 보이는 범위 밖이면 닫고, 범위 안이면 연다. ExpandedMarkdownEditor의 스크롤 영역 onScroll이 이를 부른다. setBubble이 export되지 않아 새 export가 필요하고, 다른 편집기에는 스크롤 처리를 넣지 않는다.

## 버린 대안 — 비율 확대와 카드 위치 모션은 펜 정렬을 깬다

- CSS scale + viewBox로 카드 비율대로 확대 — 컬럼 폭이 720이 아니게 되어 저장된 펜 선이 다른 글자 위로 간다. 과거에 reflow 문제로 제거했다.
- 종이 폭을 화면에 맞춰 늘리기 — 컬럼이 720 고정이라 옆이 빈 종이가 된다.
- 카드 위치에서 이동하며 커지기 — 팬·줌·기울기 계산이 커서 이번 범위를 넘는다.
- 버블을 Dialog.Content 안으로 옮기기 — Content의 transform 때문에 fixed 좌표가 어긋난다. D9의 B로 남겼다.
- Content의 onInteractOutside로 버블 클릭의 닫힘을 막기 — 닫힘이 생기지 않아 필요 없다. 원인은 body pointer-events 상속이다.
- paper 종이를 단색 memoTint 배경으로 칠하기 — text.png의 종이 결이 빠져 앞면과 색이 다르고 말린 모서리가 없다. D7의 B로 남겼다.

## 롤백 지점 — 한 PR을 되돌리면 이전 창으로 돌아간다

MemoExpandDialog, ExpandedMarkdownEditor(마운트 변경과 onScroll), BubbleMenuHost의 pointer-events, extensions.ts의 refreshBubble export, 본문 컬럼 div의 data-memo-body-column 속성, text/Content.tsx의 MEMO_PAPER 공유가 전부다. 데이터와 저장 형식은 건드리지 않는다. PR을 되돌리면 이전 창이 돌아온다. 되돌릴 수 없는 지점은 없다.

## 확인 안 된 것 — 브라우저 확인 네 가지가 남았다

- pointer-events:auto를 준 뒤 버블이 눌리고 서식이 바뀌며 창이 열려 있는지. 지금 코드에서는 안 눌리고 창이 닫히는 것까지 실측했다. 플랜 첫 태스크가 T1이다.
- 코드블록(```)과 구분선(---) 마크다운 입력 규칙이 켜져 있는지.
- 녹음·파일을 넣는 다른 경로가 앱에 있는지. 없으면 D3의 손실이 그대로다.
- text.png 말린 모서리의 실제 크기. 아래 여백 40px가 충분한지 T13에서 눈으로 본다.

## 구현 메모

- 현재 상태: 브랜치 main, 마지막 커밋 07b7c62. 워킹트리의 package.json, spec/service-launch-plan.md, web/AGENTS.md, zoomLod.ts 등은 이 일과 무관하다. 건드리지 않는다.
- 교훈 확인: lessons/2026-11-08-timeout-covers-body-read.md 무관. lessons/2026-11-08-tunnel-check-exists-first.md 무관.
- 고칠 파일: web/src/components/workspace/cards/MemoExpandDialog.tsx(머리 제거·Content 클래스·종이 층), web/src/components/workspace/cards/_shared/MarkdownEditor.tsx(ExpandedMarkdownEditor 179행의 MarkdownToolbar 제거·스크롤 영역 onScroll로 refreshBubble, 본문 컬럼 div에 data-memo-body-column 속성), web/src/components/workspace/cards/_shared/editor/BubbleMenuHost.tsx(pointer-events:auto), web/src/components/workspace/cards/_shared/editor/extensions.ts(refreshBubble export), web/src/components/workspace/cards/text/Content.tsx(MEMO_PAPER 19행을 export해 창이 같은 값을 쓴다). onInteractOutside는 넣지 않는다.
- Content 클래스 방향: MemoExpandDialog.tsx 93행의 w-[90vw] max-w-3xl h-[80vh] border border-border bg-bg rounded-lg를 폭 min(792px,94vw)·높이 min(792px,86vh)·D7 규칙의 종이 배경·6px 모서리로 바꾼다. border border-border는 뺀다. 남기면 T2의 테두리 0 기준이 실패한다. 종이 padding은 12px 24px 40px다. 가운데 정렬 방식은 D9 A에서는 상관없다. D9 B로 가면 transform 대신 inset과 margin auto를 쓴다. memoLayout.ts 주석 '모달 max-w-3xl=768px 기준'은 스크롤 영역 744px 기준으로 고친다.
- z-index: globals.css의 --z-overlay 45, --z-modal 50. 버블은 Tailwind z-50이라 모달 Content와 같다. 나중에 만든 portal이 위에 놓인다.
- 색 토큰: web/src/components/workspace/memoVariety.ts의 MEMO_COLORS·memoTint, web/src/app/globals.css 30행 --color-card-base #fdfcfa(흰 앞면). --color-panel #ffffff와 육안으로 안 갈린다. 앞면 적용은 text/Content.tsx 136행 루트 background MEMO_PAPER와 155~163행 data-memo-tint 층(mask·multiply·z-index -1)이다. text.png는 957×1021px다.
- 앞면 판정: text/face.ts의 memoFace. todo·link·linkEmpty는 흰 카드(var(--color-card-base))다. 창을 열 때 한 번 계산해 state에 고정한다.
- 진입 경로: paper 메모는 더블클릭으로 열린다. todo·link·linkEmpty는 DraggableCard.tsx 965~985행에서 편집·새 탭이 되고 1125행 펼치기 버튼도 숨겨진다. 열리는 길은 web/src/state/memoTable.ts 650~659행 openMemo의 setExpandedCard뿐이다.
- 앞면에는 제목만 보인다. 본문·펜 overlay·백링크는 창이 맡는다(text/Content.tsx 79행 주석, 사용자 결정은 59행·166~167행). 그림 1 카드의 가운데 굵은 글씨는 card.title이다.
- 버블 닫기: web/src/components/workspace/cards/_shared/editor/extensions.ts 105~125행 bubbleSlot은 scroll을 처리하지 않는다. setBubble은 export되지 않는다. refreshBubble(scrollEl)을 export하고 스크롤 영역 onScroll에서 부른다. 버블 버튼 클릭이 formatCommands의 dispatch로 scrollIntoView 스크롤을 내므로 스크롤마다 닫으면 연속 서식이 끊긴다. 본문 컬럼 div에는 data-memo-body-column을 붙인다. 제목 줄(MemoTitleRow.tsx 73·93·109행)도 moss-md 클래스라 .moss-md로는 본문 컬럼을 고를 수 없다.
- 버블 판정: MarkdownToolbar.tsx 196행과 BubbleMenuHost.tsx 35행이 둘 다 role=toolbar 이름 '서식'이다. 테스트와 확인은 [data-bubble-toolbar]로 센다.
- Radix: @radix-ui/react-dismissable-layer 1.2.1 dist/index.mjs 113행이 body pointer-events:none을 건다. 314행 onPointerDownCapture는 React 트리 기준으로 안팎을 가른다. 닫힘의 실제 원인은 판정이 아니라 클릭이 버블을 뚫고 Dialog.Overlay에 닿은 것이다.
- 실측(prover, 지금 코드, 뷰포트 1710×961): 긁으면 [data-bubble-toolbar] 1개가 보이지만 그 요소와 body의 pointerEvents가 'none'이다. B 버튼 중심의 elementFromPoint는 Dialog.Overlay다. 실제 포인터로 누르면 role=dialog가 1→0, strong은 0개다. 증거: /private/tmp/claude-501/-Users-dongpark-moss/dc12012a-44f0-4c1b-9f8e-d46e5cf06447/scratchpad/prove-baseline/04-selected-AS-IS.png, 05-after-bold-press.png.
- T4 기준선(main 빌드, 같은 환경): 메모 c-mw9fn30s-1, content "alpha bravo charlie delta echo foxtrot golf hotel\n", 'delta' 위 선 1개. 컬럼 기준 delta 좌표 x 121.84 y 8.5 w 29.09 h 15.5. polyline 첫 점 (123.8,16.3) 끝 점 (148.9,16.3). 컬럼 offsetWidth 720·13px·padding 6px 9px. 기록 파일: scratchpad/prove-baseline/b2-reopen.json, b2-card-record.json. T4의 main 빌드 쪽 측정은 이 기록으로 끝났다. 새 빌드에서만 같은 값을 재면 된다.
- MemoExpand.test.tsx 16행 vi.mock이 MarkdownEditor 모듈을 통째로 stub한다. 그 아래 DOM 단언은 툴바 제거를 판정하지 못한다.
- 검증 명령(CI .github/workflows/ci.yml 31~35행): cd web 뒤 npx tsc --noEmit, bun run lint, bun run test, bun run check:i18n, bun run build. typecheck 스크립트는 없다.
- check:i18n(web/scripts/check-i18n.mjs)은 안 쓰는 키를 경고로만 보고 종료 코드 0이다. 쓰는데 ko.json에 없는 키는 실패한다. Dialog.Title에 새 문구를 t()로 쓰면 ko.json에 같이 넣는다.
- 기존 테스트: web/src/components/workspace/cards/__tests__/MemoExpand.test.tsx는 헤더 펜·지우개 aria-label(SC-2)을 본다. 위치만 바뀌므로 그대로 통과해야 한다. MemoBlocks.test.tsx의 블록 추가 메뉴와 _shared/__tests__/MarkdownToolbar.test.tsx는 컴포넌트를 직접 렌더해 통과한다.
- 관련 스펙: spec/card-faces.md, spec/memo-color.md.
- i18n 키 workspace.memoEditor.title("메모 편집")은 화면에서 안 쓴다. check:i18n은 경고만 내므로 키 삭제는 후속이다.
- 메인 확인(2026-11-10, runner용): 작업 디렉터리는 전용 워크트리 /Users/dongpark/worktree/moss-memo-paper-expand 다. 브랜치는 feat/memo-paper-expand, base는 main 07b7c62다. 원래 체크아웃 /Users/dongpark/moss는 다른 세션이 feat/cmd-z-undo로 쓰고 있어 건드리지 않는다. 워크트리의 web/node_modules는 bun install --frozen-lockfile로 깔았고 next는 16.4.5다. 포트 3000의 dev 서버는 원래 체크아웃 것이라 이 브랜치 코드가 아니다. 커밋은 이 일의 파일만 경로로 지정해 add한다. web/AGENTS.md의 next dev 블록 diff는 커밋하지 않는다.
- 메인 확인: Canvas.virtualization.test.tsx는 2026-11-10 플랜 검토자가 단독 실행으로 통과를 봤다. 전체 스위트에서 실패하면 단독 재실행으로 플래키인지 가린다.
- 결정 D1~D9는 추천 A로 진행 중이다. user 칸은 비어 있다. 사람이 보드에서 다른 답을 주면 그때 바꾼다.

## 플랜 — STEP 3개, runner 하나가 순서대로 돈다

결정 D1~D9는 모두 되돌릴 수 있어 추천 A로 진행한다(사용자 규칙 "결정은 쌓고 계속 진행"). runner는 단위 테스트와 CI 명령까지 한다. 브라우저 확인은 메인이 띄우는 prover가 두 번 한다.

1. runner ① — STEP 0만 돈다.
2. prover 체크포인트 — T1·T9를 브라우저로 본다. 버블 B를 눌러 굵게가 생기고 창이 열려 있어야 STEP 1로 간다. 실패하면 STEP 1을 띄우지 않는다. D9 B(버블을 Content 안 portal 컨테이너로 옮기기)를 결정 행으로 다시 올린다.
3. runner ② — STEP 1·2를 돈다.
4. prover 최종 — T2 T3 T4 T5 T6 T7 T8 T10 T12 T13을 본다. T11은 STEP 2 AC가 맡는다.

종이의 DOM 구조는 이렇게 정한다. Dialog.Content(role=dialog)가 곧 종이다. T2의 borderTopWidth, T7의 배경, T13의 padding은 모두 이 요소를 잰다. 펜·지우개·✕ 버튼 줄은 Content의 자식으로 두고 absolute로 종이 박스 밖 오른쪽 위에 놓는다. 그래서 Content에서 overflow-hidden을 뺀다. Content 밖 형제로 두면 Radix가 body에 건 pointer-events:none 때문에 눌리지 않는다. 본문 넘침은 안쪽 스크롤 영역이 맡는다.

<!-- STEP:0:bubble-click-and-follow:pending -->
### T-0: 버블이 펼친 창에서 눌리고 스크롤을 따라간다 (T1·T3·T9의 코드 부분)

#### 읽을 파일
- `web/src/components/workspace/cards/_shared/editor/extensions.ts` — bubbleState·setBubble(84행)·bubbleSlot(105~125행)
- `web/src/components/workspace/cards/_shared/editor/BubbleMenuHost.tsx` — body portal, fixed, z-50
- `web/src/components/workspace/cards/_shared/editor/formatCommands.ts` — 버튼이 내는 dispatch

#### 작업
- BubbleMenuHost 버블 루트에 `pointer-events: auto`를 준다. portal 대상은 body 그대로 둔다(D9 A). onInteractOutside는 넣지 않는다.
- extensions.ts에 `export function refreshBubble(scrollEl: HTMLElement, view: EditorView | null = lastView): void`를 둔다. 둘째 인자는 테스트가 가짜 view를 넣는 자리다. bubbleSlot이 마지막으로 본 EditorView의 현재 선택으로 coordsAtPos를 다시 계산한다. 선택이 비었거나 좌표가 scrollEl.getBoundingClientRect()의 세로 범위 밖이면 CLOSED, 안이면 새 좌표로 연다. 마지막 view는 모듈 변수 lastView에 둔다. bubbleSlot plugin view의 update에서 늘 갱신하고 destroy에서 null로 비운다. CLOSED(80행)는 view가 null이라 bubbleState.view로는 다시 못 연다. 다른 편집기의 동작은 바꾸지 않는다.
- 전제 실측(2026-11-10 prover, AS-IS): 버블과 body의 pointerEvents가 'none'이라 B 클릭이 오버레이에 닿아 창이 닫혔다. 이 STEP이 그 결함을 고친다.
- 단위 테스트를 새 파일 두 개에 쓴다. 둘 다 지금은 없는 파일이라 구현 전에는 AC가 실패한다.
  - `web/src/components/workspace/cards/_shared/editor/__tests__/refreshBubble.test.ts`: 가짜 view(coordsAtPos·state.selection stub)를 둘째 인자로 넣는다. 범위 안이면 getBubbleState()의 open이 true이고 left/top이 새 좌표다. 범위 밖이면 open이 false다. 빈 선택이면 open이 false다. 범위 밖에서 닫힌 뒤 범위 안 좌표로 다시 부르면 open이 true다.
  - `web/src/components/workspace/cards/_shared/editor/__tests__/BubbleMenuHost.test.tsx`: 열린 상태에서 [data-bubble-toolbar]의 style.pointerEvents가 'auto'다. 호스트는 렌더마다 항목의 isActive(view)를 부르고, formatCommands.ts 70~72행 markCmd.isActive는 view.state.schema.marks를 읽는다. 그래서 이 테스트는 둘 중 하나로 연다: 레포와 같은 경로(@milkdown/prose/model·@milkdown/prose/state)로 만든 작은 실제 EditorState를 가진 view stub, 또는 vi.mock으로 BubbleToolbar의 memoBubbleItems 항목 isActive가 false를 돌려주게 한 뒤 refreshBubble로 연다.

#### AC
```bash
cd web && npx vitest run src/components/workspace/cards/_shared/editor/__tests__/refreshBubble.test.ts src/components/workspace/cards/_shared/editor/__tests__/BubbleMenuHost.test.tsx
cd web && npx vitest run src/components/workspace/cards/_shared/editor
cd web && grep -n "pointerEvents\|pointer-events" src/components/workspace/cards/_shared/editor/BubbleMenuHost.tsx
cd web && grep -n "export function refreshBubble" src/components/workspace/cards/_shared/editor/extensions.ts
```

#### 금지사항
- 버블을 Dialog.Content 안으로 옮기지 마라. 이유: D9에서 B로 남긴 대안이고 fixed 좌표가 transform 조상 기준이 된다.
- 스크롤마다 버블을 무조건 닫지 마라. 이유: 버블 버튼이 낸 scrollIntoView 스크롤에 닫혀 연속 서식이 끊긴다(T3).

- summary:
<!-- /STEP -->

<!-- STEP:1:paper-dialog:pending -->
### T-1: 펼친 창을 커진 메모지로 바꾼다 (T2·T4·T5·T6·T7·T8·T10·T12·T13의 코드 부분)

#### 읽을 파일
- `web/src/components/workspace/cards/MemoExpandDialog.tsx` — 93행 Content 클래스, 머리 막대, 펜/지우개, close()
- `web/src/components/workspace/cards/_shared/MarkdownEditor.tsx` — 179행 ExpandedMarkdownEditor
- `web/src/components/workspace/cards/text/Content.tsx` — 19행 MEMO_PAPER, 136행 루트 배경, 155~163행 data-memo-tint 층
- `web/src/components/workspace/memoVariety.ts` — memoTint
- `web/src/components/workspace/cards/text/face.ts` — memoFace
- `web/src/components/workspace/cards/_shared/memoLayout.ts` — MEMO_CONTENT_WIDTH 주석
- `web/src/i18n/messages/ko.json` — workspace.memoEditor

#### 작업
- MemoExpandDialog: 머리 막대(보이는 Dialog.Title·BlockMenu·구분선)를 뗀다. Dialog.Title은 화면에서 숨기고 글자는 카드 제목, 비었으면 "메모"로 쓴다. "메모 편집" 글자는 DOM에 두지 않는다. 새 i18n 키를 쓰면 ko.json에 넣는다.
- Content: border·border-border·bg-bg·rounded-lg·w-[90vw]·max-w-3xl·h-[80vh]·overflow-hidden을 뺀다. Content가 곧 종이다. AC가 파일 전체를 grep하므로 이 파일의 다른 요소에도 overflow-hidden 클래스를 쓰지 않는다. 종이는 폭 min(792px,94vw)·높이 min(792px,86vh)·padding 12px 24px 40px·6px 모서리(D1 A).
- 파일 머리 주석(14~34행)을 새 종이 구조로 고친다. 옛 클래스 이름(max-w-3xl 등)을 주석에 남기지 않는다.
- 종이 색(D7 A): 창을 열 때 memoFace를 한 번 계산해 고정한다. paper면 루트 background MEMO_PAPER(Content.tsx에서 export해 같은 값을 쓴다) + isolation:isolate + 같은 mask의 memoTint 층(data-memo-tint, mix-blend-mode multiply, z-index -1). todo·link·linkEmpty면 var(--color-card-base) 단색.
- 펜·지우개·✕(D2 A·D5 A): Content의 자식으로 두고 absolute로 종이 박스 밖 오른쪽 위에 놓는 작은 버튼 줄. aria-label과 aria-pressed는 지금 값 그대로 둔다(MemoExpand.test SC-2). 닫기는 기존 close()를 그대로 쓴다(제목 공백 확정 AC-7).
- 모션(D6 A): globals.css 241~243행의 전역 moss-scale-in(200ms, 0.96→1)을 다른 모달과 같이 그대로 쓴다. 새 animation 규칙을 넣지 않는다.
- ExpandedMarkdownEditor: `<MarkdownToolbar />`를 뗀다(파일은 남긴다). 스크롤 영역 폭 744px, padding 0, onScroll에서 refreshBubble(스크롤 영역)을 부른다. 본문 컬럼 div에 `data-memo-body-column`을 붙인다. 컬럼 폭 720·13px·padding 6px 9px는 바꾸지 않는다.
- BlockMenu 마운트를 뗀다(파일은 남긴다, D3 A).
- memoLayout.ts 주석 '모달 max-w-3xl=768px 기준'을 스크롤 영역 744px 기준으로 고친다.

#### AC
```bash
cd web && npx vitest run src/components/workspace/cards
cd web && ! grep -n "<MarkdownToolbar\|<BlockMenu" src/components/workspace/cards/_shared/MarkdownEditor.tsx src/components/workspace/cards/MemoExpandDialog.tsx
cd web && grep -n "data-memo-body-column" src/components/workspace/cards/_shared/MarkdownEditor.tsx
cd web && grep -n "refreshBubble(" src/components/workspace/cards/_shared/MarkdownEditor.tsx | grep -v import
cd web && ! grep -n "border border-border\|max-w-3xl\|overflow-hidden" src/components/workspace/cards/MemoExpandDialog.tsx
```

#### 금지사항
- 본문 컬럼 폭·글자 크기·padding을 바꾸지 마라. 이유: 저장된 card.overlay 선이 이 좌표다(T4).
- CSS scale로 본문을 키우지 마라. 이유: 과거에 reflow로 펜이 어긋나 제거했다.
- 새 animation·@keyframes 규칙을 넣지 마라. 이유: 열림 모션은 기존 전역 moss-scale-in 200ms를 쓴다(D6 A, T8).
- 버튼 줄을 Content 밖 형제로 두지 마라. 이유: Radix가 body에 pointer-events:none을 걸어 눌리지 않는다.
- BlockMenu.tsx·MarkdownToolbar.tsx 파일과 그 테스트를 지우지 마라. 이유: 롤백 지점이다.
- PhotoLightbox 분기를 건드리지 마라. 이유: 비목표다.

- summary:
<!-- /STEP -->

<!-- STEP:2:tests-and-gates:pending -->
### T-2: 테스트를 정리하고 CI 게이트를 통과시킨다 (T11, T2의 단위 부분)

#### 읽을 파일
- `web/src/components/workspace/cards/__tests__/MemoExpand.test.tsx` — 16행 vi.mock, SC-1·SC-2·SC-5
- `.github/workflows/ci.yml` — 31~35행

#### 작업
- MemoExpand.test.tsx에 창 단위 단언을 더한다: 창 안에서 queryAllByText(/메모 편집/)·queryAllByText(/블록 추가/)·queryAllByLabelText(/블록 추가/)가 모두 0개다. BlockMenu.tsx 266행의 보이는 글자는 "+ 블록 추가"라 정확 일치 문자열로 세면 구현 전에도 0개가 나온다. 그래서 정규식으로 센다. 펜·지우개·닫기 버튼이 있고 누르면 동작한다, paper 메모는 [data-memo-tint] 층이 있고 todo 메모는 없다. 열린 동안 content를 todo로 바꿔도 종이 판정이 그대로다.
- 닫기 테스트(T6, 실패 모드 5): 제목이 "  제목  "인 메모를 연다. ✕를 누르면 창이 닫히고 store의 title이 "제목"이다. Esc로 닫아도 같다. 종이 밖 Overlay 클릭으로 닫아도 같다. jsdom에서 Overlay 바깥 pointerdown이 재현되지 않으면 Overlay 경우만 리포트에 적고 prover T6에 맡긴다.
- 상단 툴바 제거는 mock 아래에서 판정되지 않으므로 STEP 1의 grep AC와 prover 브라우저 확인에 맡긴다고 테스트 주석에 쓰지 않는다. spec 구현 메모에만 둔다.
- CI 명령 5개를 돌려 모두 종료 코드 0을 만든다. 알려진 상존 실패(Canvas.virtualization.test.tsx 1건)는 main에서도 실패하는지 단독 실행으로 확인하고 리포트에 적는다.

#### AC
```bash
cd web && npx tsc --noEmit && bun run lint && bun run test && bun run check:i18n && bun run build
```

#### 금지사항
- 실패하는 기존 테스트를 skip하거나 지우지 마라. 이유: 회귀를 숨긴다. main에서도 실패하는 상존 실패만 리포트에 근거와 함께 적는다.
- web/AGENTS.md의 next dev 블록 diff를 커밋하지 마라. 이유: 이 일과 무관하다.

- summary:
<!-- /STEP -->

## 문서 리뷰

스펙: 검토자 ① sonnet ② gpt-6-luna(1바퀴), 2바퀴부터 sonnet(계열 못 나눔: GPT 한도) · 1) P0 2·P1 6·P2 3  2) 0·7·2  3) 0·4·4  4) 0·4·2  5) 0·1·2  6) 0·0·1  7) 0·0·0 · 버림 0 · APPROVE
동의: 2026-11-10 사용자 "멈추지 말고 PR 전까지 진행해". 결정 D1~D9는 추천 A로 진행한다.
플랜: 검토자 ① sonnet ② sonnet(계열 못 나눔: GPT 한도) · 1) P0 0·P1 7·P2 0  2) 0·3·0  3) 0·0·0 · 버림 0 · APPROVE
