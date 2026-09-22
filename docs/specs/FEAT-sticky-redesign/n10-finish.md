# n10-finish — 옛 생성 경로 정리와 전체 검증

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n3-fresh-db, n5-memo-front, n6-canvas-capture, n8-dock, n9-naming
**상태**: 시나리오 A 통과, 시나리오 B 부분 통과(2026-09-22). 시안 대조·결함 9·10은 미완.

## 문제

노드별로 기능이 들어와도 옛 image·link·audio·file·mindmap 카드를 새로 만드는 경로가 남아 있으면 "메모 한 종류" 원칙이 새고, 전체 흐름은 아무 노드도 끝까지 확인하지 않았다.

## 목표

옛 종류를 새로 만드는 경로가 코드에 없고, spec §10 DOD의 수동 시나리오·시안 대조가 끝나 결과가 기록돼 있다.

## 작업

1. 생성 경로 제거: `addCardAt`·단축키·붙여넣기·템플릿(`web/src/templates/`)에서 image·link·audio·file·mindmap 카드를 새로 만드는 분기를 찾아 지운다. `grep -rn '"image"\|"link"\|"audio"\|"file"\|"mindmap"' web/src --include='*.ts*'`로 후보 확인.
2. `web/src/components/workspace/cards/{image,link,audio,file,mindmap}/Content.tsx`와 관련 테스트(기준선 실패 중인 `CardContent.image`·`autoFocus` image 포함)를 삭제한다 — v5 초기화로 옛 데이터가 없다. 가져오기(export/import) 경로가 옛 종류를 받으면 거부하게 한다. `NoteKind` 값은 타입에 남긴다(spec §6).
3. 수동 시나리오 A: 빈 DB → 독에서 메모판·메모·파일함 생성 → 메모를 판에 넣고 판 이동 → 메모 창에서 이미지·링크·녹음·파일 블록 추가 → 앞면 배지 확인 → 새로고침.
4. 수동 시나리오 B: 옛 카드가 든 브라우저(v4)로 앱을 열어 빈 상태로 시작하는지, 첨부가 비었는지 확인.
5. 시안 대조: to-be 시안(https://claude.ai/code/artifact/d81cc26d-7e72-4c2f-ac1c-49054e923885) ①②③, 독 시안(https://claude.ai/code/artifact/46f2f5cb-4390-4fe5-a39f-604104b0309e) A1과 dev 서버 스크린샷을 나란히 두고 차이 목록 작성. 펜 툴바 위치(spec §9 후속)는 이 캡처로 판단 근거만 남긴다.
6. spec `Status`를 구현 완료로, `docs/moss.blueprint.json` features에 FEAT-sticky-redesign 추가(spec 머리말 "Blueprint" 항목).

## 완료 기준

- [ ] plan 공통 완료 기준 전부
- [ ] 1번 grep에서 옛 종류를 **생성**하는 분기 0건(타입 참조는 허용, 남긴 것 목록을 `구현 메모`에)
- [ ] `cd web && npx vitest run && npx tsc --noEmit && npm run build` 통과
- [ ] 시나리오 A·B 각 단계 스크린샷 경로와 통과/실패를 `구현 메모`에
- [ ] 시안 대조 차이 목록(허용/수정 필요 구분)을 `구현 메모`에
- [ ] 실경로: 위 시나리오는 `npm run build && npm run start` 프로덕션 빌드에서 수행

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | addCardAt·CAPTURE_TOOLS |
| `web/src/components/workspace/useShortcuts.ts` | 캡처 단축키 |
| `web/src/templates/` | 새 프로젝트 템플릿 카드 |
| `web/src/components/workspace/cards/` | 옛 종류 Content |
| `docs/specs/FEAT-sticky-redesign.md` | Status·DOD |
| `docs/moss.blueprint.json` | features 목록 |

## 구현 메모

**범위**: 이 실행은 작업 1·2·6(코드 정리 + spec/blueprint 갱신)만 담당했다. 작업 3·4·5(실브라우저
수동 시나리오 A·B, 시안 대조)는 runner 권한 밖이라 하지 않았다 — 호출자가 `npm run build &&
npm run start` 프로덕션 빌드로 직접 확인해야 한다. 완료 기준의 "시나리오 A·B 스크린샷", "시안
대조 차이 목록", "실경로 검증" 3개 항목은 아직 미충족 상태로 남겨둔다.

**작업 1 — 생성 경로 grep 결과와 판단**:
- `addCardAt`(workspace.ts) 자체는 `kindForTool(toolId)`로 kind를 정하는 범용 함수라 유지. 실제
  호출자(Canvas.tsx 붙여넣기/드롭, useShortcuts.ts, Dock.tsx)는 이미 n6·n8·n9에서 `"text"`만
  넘기도록 정리돼 있었다(재확인만 함, 코드 변경 없음).
- 실제로 살아있던 생성 분기 2곳을 찾아 고쳤다:
  - `state/workspace.ts` `SEED_CARDS`의 `seed-preview` 항목이 `kind: "image"`였다(첫 실행마다
    실제 image 행 생성) → `kind: "text"`로.
  - `templates/index.ts`의 "mindmap" 템플릿이 `kind: "mindmap"` 카드를 시드했다 → `kind: "text"`로
    (내용은 그대로 "중심 생각" 평문이라 블록 인코딩 불필요).
- `state/bridge/mossBridge.ts`(moss-mcp 외부 에이전트 자동화 브리지, `NEXT_PUBLIC_MOSS_BRIDGE=1`일
  때만 활성 — 없으면 Next가 상수 폴딩으로 프로덕션 빌드에서 제거)에 `notes.createImage/Audio/File/
  Mindmap` op와 `notes.create({kind:"link"|"mindmap"})`가 남아 있다. **의도적으로 손대지 않았다** —
  이 브리지는 별도 `moss/mcp` 패키지(`server.ts`, `scripts/smoke.ts`)가 소비하는 개발용 자동화
  계약이라, 여기서 kind를 text로 제한하면 moss/mcp 쪽 빌드·테스트가 함께 깨진다. moss/mcp는 n10
  브리프 범위(파일 포인터에 없음)와 FEAT-sticky-redesign spec 어디에도 언급되지 않는다 — 고치려면
  별도 사이클(브리지 계약 변경 + moss/mcp 쪽 조정)이 필요하다고 판단해 보류했다.
- 완료 기준의 grep 재실행 결과, **생성 분기로 남은 유일한 참조는 `mossBridge.ts`의 위 6곳**이다.
  나머지 hit(blocks.ts의 Block 유니온, workspace.ts/schema.ts의 NoteKind·ToolId 타입과
  kindForTool/kindToDefaultToolId/widthForKind의 타입 완전성용 switch case, canvasCapture.ts·
  Canvas.tsx·BlockMenu.tsx·blockView.ts·MemoFrontBadges.tsx의 블록(image/link/audio/file) 생성·
  렌더, MarkdownToolbar.tsx의 툴바 버튼 id, TemplatePreview.tsx·templates/index.ts의 TemplateId
  "mindmap"[스타일 이름, 카드 종류 아님])는 전부 타입 정의 또는 새 블록 모델 자체라 그대로 둔다.

**작업 2 — 삭제 내역**:
- `cards/{image,link,audio,file,mindmap,handwriting}/Content.tsx` 6개 전부 삭제(브리프 원문은
  handwriting을 언급하지 않지만, 호출자 지시로 포함 — handwriting은 이미 생성 경로가 0건이었고
  useHandwriting 훅도 handwriting 카드 하나만 쓰고 있어 안전하게 삭제 가능함을 확인).
  audio/Content.tsx의 MediaRecorder 로직은 `_shared/editor/BlockMenu.tsx`(n4)가 완전히 독립
  재구현해 두었다(mimeType 선택·getUserMedia·녹음 종료 시 putBlob) — 이식할 코드 없음, 확인만 함.
- `CardContent.tsx`는 text/comment/board/frame만 라우팅하고 default(text)로 떨어진다. 레거시
  행(가져오기 등으로 옛 kind가 유입되는 경우)은: code/handwriting은 decodeNoteToCard가 이미
  text 블록으로 환원, checklist/highlight는 migratedContent가 처리 가능하면 text로 환원, 그 외
  image/link/audio/file/mindmap은 kind가 그대로 남을 수 있어 CardContent의 default(text) 분기로
  raw content를 평문 렌더한다 — 크래시는 안 나지만 첨부(attachmentRef)는 보이지 않는다(열화 렌더,
  spec §6 "기존 종류 값은 타입에 남긴다"와 일치). **FEAT-export(가져오기)는 아직 미구현
  (Status: spec, `web/src`에 export/import 코드 없음)이라 이 시점에 실제로 옛 kind가 유입될 경로가
  없다** — export 기능을 만들 때 옛 kind import를 거부하도록 그쪽 스펙에서 챙겨야 한다.
- 함께 죽는 헬퍼도 삭제: `useClipboardWatch.ts`(유일한 두 호출자였던 image/link Content 삭제로
  무호출), `cards/_shared/surface.ts`(`cardSurface` 호출자 0), `cards/_shared/dialogOpened.ts`
  (`dialogOpenedFor` 호출자 0), `cards/_shared/blocks/useHandwriting.ts`(handwriting 카드
  하나만 쓰던 훅).
- 관련 테스트 삭제: `CardContent.{image,link,audio,file,mindmap,handwriting}.test.tsx`,
  `CardContent.autoFocus.test.tsx`(6개 케이스 전부 삭제 대상 kind라 파일 전체가 무의미해짐),
  `useClipboardWatch.test.tsx`.
- `templates/index.ts`·`workspace.ts`(SEED_CARDS) 변경에 맞춰 `templates.test.ts`(무변경 —
  kind 특정 assert 없음), `workspace.test.ts`·`TemplatePicker.test.tsx`의 mindmap kind 기대값을
  "mindmap"→"text"로 갱신.

**작업 3 (dead code, 브리프 범위 밖 추가 정리 — 호출자 지시)**:
- `cards/MemoCard.tsx`(호출자 0, import 0) 삭제.
- i18n: `capture.tool.*`(text 제외 9개), `capture.audio.{denied,placeholder,savedFallback,stop,
  unsupported}`(recording만 BlockMenu.tsx가 씀 — 유지), `capture.file.*`·`capture.image.*`·
  `capture.link.*`·`capture.mindmap.*` — 전부 이번에 지운 Content.tsx가 유일한 소비자였다.
  `capture.block.*`·`capture.checklist/code/highlight.*`·`capture.text.placeholder`·
  `cards.title.placeholder`·`workspace.memoEditor.*`·`workspace.memoFront.badge.*`·
  `workspace.tool.*`는 check-i18n에 여전히 unused로 뜨지만 **이번 개편 이전부터 죽어있던 것**이라
  손대지 않았다(FEAT-markdown-memo-pen 등 다른 feat의 잔재로 추정, n10 범위 아님).
  `templates.*.name/description`은 `t(tpl.nameKey)`처럼 동적 키로 쓰여 check-i18n이 오탐하는
  것이지 실제로는 쓰인다 — 지우면 화면 문구가 깨지므로 건드리지 않음.
- `public/cards/v2/{audio,checklist,code,file,handwriting,highlight,image,image-wide,link,
  link-wide,mindmap}.png` 11개 삭제(참조 0 확인, `cardSurface`/`DockDragPreview`의
  `${kind}.png` 동적 경로가 실제로 도달 가능한 kind는 text/comment뿐임을 호출자 목록으로 확인).
  `text.png`·`comment.png`는 유지. `public/cards/v2/orig/`(원본 아카이브, 코드 미참조)는
  brief 문구가 top-level PNG만 지목한다고 보고 손대지 않았다.

**작업 4 — Canvas.virtualization.test.tsx 기준선 실패**: 옛 카드 종류와 무관하다. 200개 카드
중 viewport 안 100개("in-*")가 DOM에 하나도 안 잡히는 결함(mount 후에도 `[data-card-id]` 자체가
0건) — jsdom `getBoundingClientRect` 오버라이드와 Canvas.tsx의 `didFitRef`/`fitToCards` 초기
측정 타이밍이 안 맞물리는 것으로 보이나, 원인을 더 파고들진 않았다(무관 확인만, 수정은 범위 밖).
전체 스위트는 이 1건만 남기고 통과(기준선 7개 → 1개로 감소 — 나머지 6개는 이번 삭제 대상 자체가
사라지며 함께 없어짐).

**커밋**: 641254b(생성 경로 2곳 수정), 48c5501(Content.tsx·테스트 삭제), 35fee57+62e51e1
(죽은 코드·i18n·PNG — ko.json 스테이징 누락으로 커밋이 갈라짐, 62e51e1이 실반영).

### 브라우저 검증 (2026-09-13, 메인 세션, pharos 내장 브라우저 · `next start` 프로덕션 빌드 048de6b · 창 폭 691px)

**시나리오 B — 통과.** 개편 전 앱(main, v4)으로 notes 8행(image·link·mindmap 포함)과 OPFS 첨부 1개를 심은 뒤 같은 origin에서 새 빌드를 열었다 → IDB version 50(v5), notes·boards·connections·embeddings 0행, settings 1행 유지, `boards.parentBoardId` 인덱스 유지, `moss-attachments` 디렉터리 없음.

**시나리오 A — 대부분 통과.**
- 통과: 독 버튼 5개(메모판·메모·파일함·펜·시그널스), 사이드바 없음, 독 Enter로 세 가지 생성(AC-1·3 키보드 경로). 메모를 판 안에 놓으면 frameId 저장, 판을 (+141,−70) 옮기면 멤버도 (+141,−70) 이동·DB 반영(AC-10·11). 메모 창 블록 추가 메뉴 4항목, 링크 삽입 → 본문 `[예시 문서](https://example.com/docs "moss-link")`, 새로고침 후 유지, 앞면 "링크 1개" 배지(AC-8·9). PDF 파일 드롭 → 파일 블록 든 text 메모 + OPFS 저장(AC-7). **창에서 "판에 넣을 메모" 위에 그은 펜 선이 앞면에서도 같은 글자 위에 그려짐(펜 1:1, /hate 급소 해소 확인).** 블록 막대 높이 창 32px = 앞면 32px×줌 0.85.
- 실패/결함:
  1. **AC-5 독 가림 옅어짐이 동작 안 함** — 파일함 카드(화면 210..410×859..1059)가 독(232..482×901..957)과 겹치는데 독 opacity 1. 줌 변경으로 스토어를 바꿔도 1.
  2. **앞면 읽기 전용 블록에 "열기" 버튼이 보임**(display block) — AC-8 "앞면에 열기 요소 없음" 위반. 링크 블록은 버튼 없음.
  3. **블록 막대가 카드 오른쪽 끝을 넘어 튀어나옴** — 앞면에서 흰 막대가 종이 가장자리 밖으로 약 15px 보인다(크롭 누락).
  4. **독 Enter/가운데 생성이 같은 자리에 겹쳐 생성** — 메모판·메모·파일함이 한 점에 쌓여, 메모를 조금만 끌어도 파일함에 흡수됐다(실제로 발생).
  5. **파일함 카드가 옛 디자인** — 📦 이모지 + "이름 없는 캔버스" 문구. 시안의 파일박스 아이콘·"파일함" 명칭과 다름.
  6. **메모 앞면이 흰 종이(`/cards/v2/text.png`)** — spec §7 "노란 포스트잇 모양"과 다름.
  7. **메모판 이름표가 멤버 메모에 가려짐**(판 위쪽에 메모가 붙으면 "새 메모판"이 잘림).
  8. **독이 메모 창(모달) 오버레이 위에 그려짐** — 모달이 열려도 독이 흐려지지 않고 맨 위.
  9. 좁은 창(691px)에서 토스트가 독을 가림. 새 빌드 첫 로드에 "이 메모는 무소속이에요"·"빈 메모 삭제됨" 토스트가 뜸(첫 실행 샘플 카드 생성→빈 메모 정리로 추정, 미확인).
  10. 콘솔: `Script error.` 다수(교차 출처라 원문 불명, pharos 주입 스크립트 가능성), `NotFoundError` 1건(OPFS 비우기 경로 추정, 미확인).
- 확인 불가(환경): 독 hover 확대 — 버튼 inline style은 71.7px로 바뀌지만 이 WebView(백그라운드 pane)에서 CSS transition이 진행되지 않아 실제 크기는 40px로 측정됨. 녹음(마이크 권한), 파일 선택 창, 시안과의 시각 대조는 미수행.

스크린샷: scratchpad `shot-B-fresh.png`, `shot-A1-created.png`, `shot-A2.png`, `shot-A4-link.png`, `shot-A5-reload.png`, `shot-A6-filedrop.png`, `shot-A7-pen.png`(세션 임시 경로).

**후속으로 남긴 결정**: `state/bridge/mossBridge.ts`가 옛 kind를 만드는 6곳은 `moss/mcp` 계약과 함께 바꿔야 해 후속 작업으로 둔다(사용자 결정 2026-09-13).

### 결함 1~8 수정 (2026-09-13, runner)

결함마다 수정 전 실패하던 jsdom 테스트를 먼저 추가해 재현을 확인한 뒤 고쳤다(전체
스위트는 기준선 `Canvas.virtualization` 1건만 남기고 통과, 새 실패 0).

1. **AC-5 독 가림 안 옅어짐** — `Dock.tsx`의 recompute가 store 좌표(viewport
   수식, `cardOccludesDock`)로만 판정해 캔버스 루트 오프셋·실제 렌더 높이(auto-grow)
   차이를 못 잡았다. 실제 렌더된 카드 DOM(`[data-card-id]`)의 `getBoundingClientRect()`를
   우선 쓰고, DOM에 없을 때만 수식으로 폴백(canvasOffset 인자 추가)하도록 고쳤다.
2. **앞면 읽기 전용 블록에 열기 버튼** — 두 겹 버그. (a) ProseMirror는
   `plugin.view(view)` 훅보다 먼저 초기 `decorations()`를 계산해, `currentView`가
   아직 null이라 readonly가 항상 false로 굳었다 → `view()` 훅에서 view가 붙은 뒤
   `queueMicrotask`로 `view.updateState(view.state)`를 강제해 재계산시켰다.
   (b) 그래도 `WidgetType.eq()`가 위젯 `key`(내용 기반, readonly 무관)만 같으면
   "같은 위젯"으로 보고 옛 DOM(버튼 있음)을 재사용했다 → key에 readonly를
   포함시켜(`-ro`/`-rw` 접미사) 전환 시 위젯이 다시 만들어지게 했다.
3. **블록 막대가 카드 밖으로 튀어나옴** — `DraggableCard.tsx` 루트의
   `overflow:hidden`이 `card.height !== undefined`일 때만 켜졌다 — auto-grow
   카드(height 미지정)는 크롭이 꺼져 고정폭 720px 블록 막대가 그대로 보였다.
   overflow는 height 유무와 무관하게 항상 hidden으로 바꿨다.
4. **독 Enter/가운데 생성이 겹침** — `addCardAtViewportCenter`·
   `addFrameAtViewportCenter`·`createSubcanvasAtViewportCenter`가 항상 같은
   화면 중앙 월드 좌표를 계산했다 — 연달아 누르면 정확히 같은 자리에 쌓였다.
   `avoidCenterOverlap` 헬퍼로 그 자리에 이미 카드가 있으면 spec §4와 같은
   24px 간격으로 대각선 비켜 놓게 했다.
5. **독이 모달 오버레이 위에 그려짐** — `Dialog.Overlay`가 `z-[var(--z-overlay)]`를
   썼는데 `--z-overlay` CSS 변수가 어디에도 정의돼 있지 않아 invalid value →
   z-index auto로 떨어져 독(`--z-panel:40`, position:fixed)에 밀렸다.
   globals.css·tokens.ts에 `--z-overlay: 45`(panel과 modal 사이)를 추가했다.
6. **파일함 카드 옛 디자인** — `board/Content.tsx`의 📦 이모지 + "이름 없는
   캔버스"를 filebox 아이콘(`/icons/dock/filebox.png`) + "이름 없는 파일함"으로
   바꿨다(카드 개수 표시는 그대로).
7. **메모 앞면이 흰 종이** — `text/Content.tsx`의 `/cards/v2/text.png` 배경을
   `--gradient-postit`(따뜻한 노랑 그라디언트) + `--shadow-postit-fold`(오른쪽
   아래 접힘 그림자) CSS로 바꿨다. 메모 창(모달) 배경은 손대지 않았다 — spec
   §7은 "메모 앞면"(카드)만 포스트잇으로 못박고, 창은 문서 편집 화면이라
   중립 배경이 가독성에 유리하다고 판단(spec에 창 배경 요구 없음).
8. **판 이름표가 멤버 메모에 가려짐** — frame의 `DraggableCard` 루트가
   `z-index:1~2`를 명시해 그 자체로 스택 컨텍스트를 만들었다 — 안의 이름표가
   아무리 높은 z-index를 받아도 그 컨텍스트를 못 벗어나 메모(z:10~40)에 항상
   가려졌다. frame 루트의 z-index를 아예 안 주도록(auto) 바꿔 스택 컨텍스트
   생성을 막고, 이름표 자신에 `zIndex:15`(미선택 메모 10보다 높음)를 줘
   world-layer 레벨에서 직접 비교되게 했다. frame은 z-index:auto라 여전히
   양수 z-index 메모보다 항상 아래로 그려진다(§7 요구 유지). 겹친 두 frame
   사이의 미세한 선택 우선순위(이전 1/2 구분)는 이 과정에서 빠졌다 — DOM
   순서(생성 순)로 대체되며, 이를 검증하는 테스트는 없었다.

**손대지 않은 것(결함9·10, 범위 밖)**: 좁은 창 토스트가 독을 가리는 문제,
콘솔 `Script error.`/`NotFoundError` — 원인 미확인 상태로 보고서에 남아 있고
이번 지시(결함 1~8)에 포함되지 않아 그대로 뒀다.

### 결함 1~8 재확인 (2026-09-13, 27b9579 프로덕션 빌드, pharos 내장 브라우저)

- 2 앞면 읽기 전용 블록 버튼: **해결** — 앞면 링크·파일 블록의 보이는 버튼 0개.
- 3 막대 튀어나옴: **해결** — 블록을 자르는 조상의 오른쪽 끝이 카드 오른쪽 끝과 같음(241=241, 447=447).
- 4 겹쳐 생성: **해결** — Enter로 만든 메모판(−59,623)·메모(−19,623)·파일함(241,863)이 한 점에 쌓이지 않음.
- 5 독이 모달 위: **해결** — 메모 창이 열리면 독 자리 최상단 요소가 오버레이(z 45 > 독 z 40).
- 6 파일함 카드: **해결** — `/icons/dock/filebox.png` + "이름 없는 파일함 / 카드 1개".
- 7 메모 앞면: ~~노란 포스트잇 그라디언트~~ → **되돌림** — CSS 그라디언트가 종이 질감·접힌 모서리를 없애 사용자 결정으로 원래 `/cards/v2/text.png`로 복구, spec §7 문구를 흰 종이로 수정.
- 8 메모판 이름표: **해결** — 이름표 중심의 최상단 요소가 이름표 자신.
- 1 독 옅어짐: **판정 보류(환경)** — 파일함 카드가 독과 겹쳐도 opacity 1이지만, 이 pharos 브라우저 pane은 비활성 워크스페이스라 `document.visibilityState === "hidden"`이고 `requestAnimationFrame`이 한 번도 불리지 않는다(500ms 대기 후 0회). 가림 판정이 rAF 스로틀을 타므로 이 환경에서는 동작할 수 없다. 첫 검증의 "AC-5 실패"와 독 hover 확대 미측정도 같은 원인일 가능성이 크다. 보이는 브라우저에서 재확인 필요.

### 보이는 화면 재확인 (2026-09-13, 2607405, pharos 워크스페이스 전환 후 visibilityState=visible · rAF 0.4s 25프레임)

- 1 독 옅어짐(AC-5): **해결** — 파일함 카드가 독과 겹치면 opacity 0.6, 독 hover(mouseover) 시 1, 벗어나면 0.6. 앞선 "실패"는 백그라운드 pane에서 rAF가 멈춘 환경 탓이었다.
- 독 hover 확대(AC-2): **통과** — 가운데 아이콘 72px, 이웃 48px, 나머지 40px. 벗어나면 전부 40px. 확대 중 독 left 232px 고정(흔들림 없음). 평소 독 폭 250px, 화면 중심과 11px 차이.
- 메모판 이름표: 판 안쪽 위(top +7px)로 옮김, 이름표 윗부분 최상단 픽셀이 이름표 자신 — 잘림 해소.
- 메모 앞면: 원래 종이 이미지(`/cards/v2/text.png`)로 복구 확인.

### 시나리오 A·B 실행 (2026-09-22, 8c309f6 + tsc fix, `npm run build && npm run start`, pharos 브라우저 pane 859px)

먼저 `npm run build`가 깨져 있었다 — `state/export/mossBundleImport.ts:206` Dexie
`transaction("rw", 테이블 5개, cb)`가 오버로드 상한(테이블 4개)을 넘어 타입 에러.
테이블을 배열로 묶어 고쳤다(FEAT-export가 남긴 회귀, 런타임 동작은 동일).

**시나리오 A — 통과.** 스크린샷 `/tmp/moss-s1..s14.png`.

| 단계 | 결과 |
|---|---|
| 독 클릭으로 메모판·파일함 생성 | 통과 — "새 메모판", "이름 없는 파일함 / 카드 0개" |
| 메모 창 블록 추가 메뉴 | 통과 — 이미지·링크·녹음·파일 4개 |
| 링크 블록 삽입 | 통과 — 창에 막대, 앞면에 버튼 없는 막대 |
| 이미지·파일 블록 삽입 | 통과 — 창에 이미지와 `note.txt` 열기 막대 |
| 앞면 배지 | 통과 — 🔗1 · 📎1 |
| 메모를 판에 넣고 판 이동 | 통과 — 판을 −130,−80 끌자 메모가 같은 양만큼 따라옴 |
| 새로고침 | 통과 — 판·파일함·메모·블록·배지 전부 유지 |

**시나리오 B — 부분 통과.** v4 DB를 손으로 심어 v5 업그레이드를 태우는 건 못 했다.
페이지가 DB 연결을 붙들고 있어 `indexedDB.deleteDatabase`가 무기한 블록된다.
DB 비우기는 `freshV5.test.ts`(실제 Dexie v4→v5 upgrade)가 덮고, 브라우저에서만
확인 가능한 OPFS 첨부 비우기는 직접 실증했다: `moss-attachments/old.png`를 심고
`moss:opfsPurgePending=1`을 세운 뒤 새로고침하면 디렉터리가 사라지고 플래그가
`null`이 된다. n3가 남긴 "OPFS 비우기 실기동 미확인" 갭은 이걸로 닫힌다.

주의 — localhost:3000에서 위 실험을 하다 `deleteDatabase`가 블록된 채 남아
그 origin의 IDB가 잠겼다. 127.0.0.1:3000(별도 origin)에서 다시 재서 확인했다.
같은 실험을 반복하려면 origin을 바꾸거나 webview 저장소를 비울 것.

**미완**: 시안 대조(작업 5) — 시안이 claude.ai artifact라 CLI에서 못 연다. 사람이 볼 몫.
결함 9(좁은 창 토스트가 독을 가림)·10(콘솔 Script error/NotFoundError)도 그대로다.

**옆에서 발견**: `Canvas.virtualization.test.tsx`의 "viewport 밖 카드는 DOM에
마운트되지 않는다"가 실패한다(`expected [] to include 'in-0'` — 카드가 하나도
마운트되지 않음). 이 세션 변경과 무관하고 FEAT-canvas AC-3 소관이다.
전체는 834/837 통과, tsc 0.
