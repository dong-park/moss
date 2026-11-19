# 유리벽 — 마카로 쓰고 포스트잇을 붙이는 개인 사고판

| 항목 | 값 |
|---|---|
| 종류 | 줄기 |
| 문제 | 손으로 쓰고 붙이며 공간에 생각을 펼치고 싶은 사람에게 맞는 개인용 벽이 없다 — 화이트보드 도구는 팀용이라 과하고, 메모앱은 시각적이지 않고, 종이와 포스트잇은 흩어져 다시 못 찾는다 |
| 상위 | 없음 |
| 상태 | 진행 |
| 시작 | 2026-10-11 |
| 근거 | docs/research/personas.md |

> 줄기 문서. 큰 문제 하나에 문서 하나다. 진행 상태는 여기 쓰지 않는다 — 각 스펙의 머리 표에 있고, `/spec map`이 모아서 보여 준다.
> 스펙이 이 줄기를 가리키려면 머리 표 `상위` 칸에 이 파일 경로를, `상위문제` 칸에 위 `문제` 값을 그대로 적는다.

## 문제 — 공간에 손으로 생각하는 사람에게 혼자 쓸 벽이 없다

어떤 사람들은 생각을 글줄이 아니라 벽에 붙이고 선으로 이으며 이해한다. 그런데 큰 화이트보드 도구는 팀용이라 과하고, 메모앱은 시각적이지 않다. 리서치의 한 사람은 "큰 화이트보드는 내게 너무 복잡하고, 메모앱은 충분히 시각적이지 않다"고 했다. 그래서 이들은 종이와 포스트잇으로 돌아가고, 조각은 공책과 탭과 책상에 흩어져 다시 못 찾는다.

## 끝난 모습 — 보드를 열면 그 자체가 유리벽이다

보드를 열면 뒤가 살짝 비치는 유리벽이 서 있고, 마카가 앞에 놓여 있다. 사용자는 벽 어디에든 마카로 바로 쓰고, 포스트잇을 붙였다 떼고, 둘을 동그라미와 화살표로 잇는다. 휴대폰에서는 벽을 보고 포스트잇을 붙이고, 마카는 태블릿과 데스크톱에서 쓴다. 벽은 내 기기에 있고, 수천 장이 붙어도 끊기지 않고, 언제든 내 파일로 꺼낼 수 있다.

## 이 줄기에 넣지 않는 것 — AI, 협업, 꾸미기는 이 벽 밖이다

- **AI 응집기.** 연결 제안, 요약, 홈 재노출 큐레이션은 넣지 않는다. 이 줄기의 중심은 손으로 쓰고 붙이는 아날로그 경험이다. 이미 만든 AI 코드는 remove-ai가 지운다.
- **공유·실시간 공동 편집.** 이미 따로 만들어졌고 보너스로 남는다. 이 줄기는 혼자 쓰는 벽만 다룬다. 공유가 혼자 쓰는 신뢰를 해치는 지점은 local-promise가 본다.
- **꾸미기 세팅.** 스티커, 테마, 장식은 만들지 않는다. 리서치는 꾸미기가 생각을 대체하는 착시를 이탈 원인으로 꼽았다. 벽 재질만 몇 개 고를 수 있고, 기본은 유리라 고르지 않아도 된다.
- **휴대폰 마카.** 휴대폰에서는 벽을 보고 붙이기만 한다. 마카 필기는 태블릿과 데스크톱 몫이다.
- **무엇을 유료로 팔지.** 가격 실험으로 따로 정한다. 이 줄기는 이미 무료인 기능을 줄이지 않는다는 원칙만 지킨다.
- **손글씨 검색.** 마카 글씨를 글자로 읽어 검색하지 않는다. 찾을 것은 포스트잇 글로 남긴다.
- **정밀 필기 앱 대체.** PDF 주석, 레이어 필기, 필기감 세부 튜닝은 하지 않는다.
- **태스크 관리와 생산성 지표.** 완료율, 연속 기록, 마감은 만들지 않는다.
- **연구자 출처·인용 관리.** 나중에 연구자 인터뷰로 필요한지 확인한다.

## 티켓 후보 — 14개, 벽 자체 6개와 기본기 7개와 AI 지우기 1개

우선순위는 리서치 근거와 이번 방향으로 제안한 값이다. P0은 유리벽이 성립하는 데 없으면 안 되는 것이다. P1은 손맛과 기본기다. P2는 그다음이다. "토대" 칸은 기존 구현 위에 올리는지, 새로 만드는지를 적는다.

### 벽 자체

| 슬러그 | 한 줄 목표 | 토대 | 대응 페르소나 | 근거 리서치 절 | 기존 스펙과 겹침 | 우선순위 |
|---|---|---|---|---|---|---|
| glass-surface | 보드 바탕이 뒤가 살짝 비치는 유리벽이고, 빛과 깊이로 벽 앞에 서 있다는 감각이 든다. 재질은 유리·화이트보드·코르크 정도만 고를 수 있고 기본은 유리다 | 새로 | P5 P2 | §2 P5 목표, §3 공간적 사고 행, §2 P7 이탈 이유 '꾸미기 착시' | FEAT-frame-skins는 메모판 배경만 바꾸고 그대로 메모판에만 남는다. 캔버스 바탕은 아무 스펙도 다루지 않는다 | P0 |
| wall-marker | 마카 하나로 벽 어디에든 바로 쓴다. 벽에 그으면 벽 획, 포스트잇 위에 그으면 그 포스트잇의 획이 된다. 태블릿과 데스크톱에서 쓴다 | 새로. 그리기 엔진은 재사용하고 기존 펜을 마카로 합친다 | P5 P2 학생층 | §2 P5 5번, §3 공간적 사고 행 | FEAT-pen-drawing-engine 엔진, FEAT-pen-mode-ux 모드, FEAT-markdown-memo-pen 메모 위 펜. 지금 획은 메모 카드 안에만 산다 | P0 |
| marker-feel | 마카에 굵기와 번짐이 있고 색은 몇 개뿐이며, 지우개는 손바닥이나 천으로 닦는 느낌이다 | 기존 위에 | P5 학생층 | §2 P5 5번, §4-2 모바일 캡처·태블릿 손글씨 | FEAT-pen-mode-ux의 펜·지우개·굵기 툴바 | P1 |
| sticky-handfeel | 포스트잇을 벽이나 메모판에 붙이면 착 붙고, 떼면 모서리부터 들린다 | 기존 위에 | P2 P5 | §3 공간적 사고 행 | FEAT-sticky-redesign, FEAT-drag-tilt, FEAT-frame-feel, memo-color. 메모판은 벽에 걸린 코르크판·화이트보드 같은 구역으로 남는다 | P1 |
| marker-meets-sticky | 마카로 포스트잇 둘레에 동그라미와 화살표를 그린다. 선은 그림일 뿐이라 포스트잇을 옮겨도 그 자리에 남는다 | 기존 위에 | P5 P2 P3 | §3 공간적 사고 행 | 기존 연결선 기능은 그대로 따로 남는다. 마카 화살표는 연결선이 아니다 | P1 |
| wall-wipe-snapshot | 벽을 닦아 비우고, 닦기 전 모습을 사진 찍듯 남겨 다시 볼 수 있다 | 새로 | P2 P4 | §3 묘지 행, §3 빈 캔버스 마비 행 | 휴지통 스펙들과 일부 겹침 | P2 |

### 벽을 받치는 기본기

| 슬러그 | 한 줄 목표 | 토대 | 대응 페르소나 | 근거 리서치 절 | 기존 스펙과 겹침 | 우선순위 |
|---|---|---|---|---|---|---|
| first-wall | 처음 온 사람 앞에 빈 유리벽과 마카가 놓여 있고, 설명 없이 첫 획을 긋는다 | 기존 위에 | P2 P7 P1 | §1-3, §3 빈 캔버스 마비 행 | FEAT-onboarding-routes의 첫 보드 고르기, FEAT-canvas-initial-view | P0 |
| local-promise | 공유하지 않은 벽은 서버를 거치지 않는다. 공유하는 순간 "이 보드는 서버에 올라갑니다"를 알린다. 로그인 없이도 혼자 쓴다 | 기존을 고침 | P6 P1 P2 | §1-5, §2 P6 | FEAT-onboarding-routes의 로그인 기본 결정을 되돌린다. FEAT-collab-auth 공유 흐름에 고지가 붙는다. remove-ai가 끝나면 본문이 밖으로 나가는 길은 공유 하나만 남는다 | P0 |
| korean-search-ime | 벽에 붙은 포스트잇을 초성과 부분 일치로 찾고, 한글 조합 중에 글자가 두 번 들어가지 않는다 | 기존 위에 | P7 P5 | §1-7, §2 P7 5번 | FEAT-memo-fulltext-search는 완료됐지만 초성 처리가 없다 | P0 |
| phone-to-wall | 휴대폰에서 벽을 보고, 공유 버튼으로 포스트잇 한 장을 2초 안에 붙인다. 휴대폰에서는 마카를 쓰지 않는다 | 새로 | P2 P7 P4 | §2 P7 1번, §4-2 모바일 캡처 | FEAT-mobile은 피드와 캡처 바만 다루고, 피드의 '머무는 생각' 카드는 remove-ai와 겹친다 | P1 |
| wall-zoom | 멀리서는 벽 전체의 덩어리가, 다가가면 포스트잇 글과 마카 글씨가 읽힌다 | 기존 위에 | P2 P5 | §1-3, §3 지형도 압도감 행 | 커밋 안 된 zoomLod 작업이 메모만 다룬다. 마카 획은 아직 없다 | P1 |
| wall-scale | 포스트잇 수천 장과 마카 획이 많아도 팬과 줌이 끊기지 않는다 | 기존 위에 | P5 | §2 P5 1번, §4-2 성능이 생사 | FEAT-canvas AC-3 가상화. 마카 획은 가상화 대상이 아니다 | P1 |
| local-ownership | 벽을 마카 획까지 포함해 내 파일로 꺼내고, 다시 들여와도 같으며, 마지막 백업이 언제인지 보인다 | 기존 위에 | P6 P1 P5 | §1-5, §3 데이터 소유권 행 | FEAT-export. 벽 마카 획은 아직 싣는 규칙이 없다 | P1 |
| remove-ai | 홈 재노출, 시그널스, AI 파이프라인과 임베딩 전송을 코드까지 지운다. 지우면 메모 본문이 밖으로 나가는 AI 경로가 사라져 local-promise가 지킬 경로가 공유 하나로 준다 | 기존을 지움 | P6 P1 | §1-5, §2 P6 AI creeping | FEAT-home, FEAT-signals, FEAT-ai-pipeline, FEAT-freemium의 AI 쿼터. 참조처는 구현 메모에 적었다 | P1 |
| wall-to-draft | 벽에서 고른 포스트잇을 순서 있는 초안으로 넘겨 외부 편집기로 가져간다 | 기존 위에 | P3 P4 | §4-2 아웃풋 전환 공백 | FEAT-export와 일부 겹침 | P2 |

## 구조 결정

- 2026-10-11 — 원래 "리서치에서 나온 이탈 원인을 AI 재노출과 기본기로 막는다"였다가 "손으로 쓰고 붙이는 개인용 유리벽"으로 바뀌었다 — 사용자가 원하는 경험은 아날로그 감성의 사고다. 그래서 AI 티켓 셋을 빼고, 남은 기본기는 유리벽을 받치는 티켓으로 다시 썼다. 폴더도 persona-pains에서 glass-wall로 옮겼다.
- 2026-10-11 — 유리벽은 새 판 종류나 스킨이 아니라 캔버스 전체다 — 고르는 단계가 하나라도 생기면 세팅 피로가 돌아온다.
- 2026-10-11 — 리서치가 전제한 "팀 협업은 비목표"가 뒤집혔다 — 공유와 공동 편집이 2026-09-28에 구현됐다. 사용자 결정은 "개인 사고가 우선, 협업은 보너스"다.
- 2026-10-11 — 공유하지 않은 보드는 서버를 거치지 않고, 로그인 없이도 혼자 쓰게 한다 — 프라이버시층은 이 약속을 지불 전 진입 조건으로 본다. 온보딩 스펙의 "로그인 기본" 결정을 되돌린다.
- 2026-10-11 — 펜을 "스케치용"으로 낮추려다 마카를 1급 도구로 올렸다 — 벽에 손으로 쓰는 게 이 줄기의 중심이 됐다. 손글씨 검색 기대는 여전히 만들지 않는다. handwriting-scope 티켓은 wall-marker와 이 줄기의 경계로 흡수했다.
- 2026-10-11 — 연구자 출처·인용을 줄기 밖으로 뺐다 — 생존 조건인지 인터뷰 검증이 없다.
- 2026-10-11 — 메모판은 벽에 걸린 구역으로 남는다 — 코르크판이나 화이트보드처럼 포스트잇을 묶는 역할이 그대로 쓸모 있다. 메모판 스킨은 메모판에만 둔다.
- 2026-10-11 — 펜과 마카를 한 도구로 합친다 — 도구가 둘이면 어디에 쓸지 먼저 골라야 한다. 그린 곳에 따라 벽 획인지 포스트잇 획인지 갈린다.
- 2026-10-11 — 마카 화살표는 그림으로만 남는다 — 손으로 그은 선이 저절로 따라 움직이면 종이 감각이 깨진다. 기존 연결선 기능은 따로 둔다.
- 2026-10-11 — 평생 요금을 두려다 유료 기준 자체를 이 줄기에서 미뤘다 — AI가 빠져 팔 것이 정해지지 않았다. 가격 실험으로 따로 정하고, 이미 무료인 기능을 줄이지 않는다는 원칙만 남긴다. pricing-principles 티켓은 뺐다.
- 2026-10-11 — 이미 만든 AI 기능을 숨기지 않고 코드까지 지운다 — 줄기 밖 기능을 남기면 본문이 밖으로 나가는 경로와 관리할 코드가 계속 남는다. remove-ai 티켓을 새로 넣었다.
- 2026-10-11 — 휴대폰은 붙이기와 보기만 한다 — 작은 화면의 손가락 필기는 마카 손맛을 못 낸다. 마카는 태블릿과 데스크톱에서 쓴다.
- 2026-10-11 — 벽 재질을 고르지 못하게 하자는 제안을 뒤집어 몇 개는 고르게 했다 — 사용자 결정이다. 꾸미기 착시와의 긴장은 "재질은 유리·화이트보드·코르크 정도만, 세팅 강요 없음, 기본은 유리"로 푼다.

## 열린 질문

없음

## 구현 메모

- 근거 인용: `docs/research/personas.raw.json` — "The big whiteboard tools felt too complex for my needs, and simple note apps weren't visual enough" (hn.svelte.dev/item/45594777), "understand by seeing, where ideas are placed on a whiteboard" (talk.macpowerusers.com/…/45607), GoodNotes 무한 캔버스 요청 3,565표.
- 현재 펜: `DrawingLayer`는 `DraggableCard.tsx`, `MemoExpandDialog.tsx`, `cards/text/Content.tsx`에서만 쓰인다. 캔버스 수준 획 레이어는 없다. 상태는 `state/workspace.ts`의 `penMode`·`penTool`·`penWidth`.
- `Canvas.tsx` 154·169행: 펜 모드에서는 메모 기울임을 0으로 둔다.
- 포스트잇 손맛 토대: FEAT-sticky-redesign 구현 완료, FEAT-drag-tilt·FEAT-frame-feel 실브라우저 손맛 확인 대기, `spec/memo-color.md` 색 5개.
- LOD: `web/src/components/workspace/cards/_shared/zoomLod.ts` — `MEMO_LOD_SCALE = 0.6`. 커밋 전이다.
- 가상화: `docs/specs/FEAT-canvas.md` AC-3, `useVirtualizedCards.ts`.
- 검색: `web/src/state/memoSearch.ts` — 초성 처리 흔적 없음.
- 협업: `docs/specs/FEAT-collab-auth.md` D3 Yjs + y-indexeddb, D9 공유 보드 서버 평문 저장.
- 로그인 기본: `docs/specs/FEAT-onboarding-routes.md` 14행, D5-1.
- 가격: `docs/specs/FEAT-freemium.md` — Free 월 100회 AI 쿼터, Pro $8.
- 내보내기: `docs/specs/FEAT-export.md` — `.moss` 번들, 메모 펜 획 싣기 규칙은 있다.
- 빠진 AI 티켓: resurfacing-quality, explainable-connections, ai-data-flow. 빠진 가격 티켓: pricing-principles.
- remove-ai 지울 대상: `web/src/state/ai/`(client, cluster, connectionScore, embeddingQueue, hash, useAIPipeline), `web/src/state/signals/`, `web/src/components/signals/SignalsPanel.tsx`, `web/src/server/ai/`(embed, summarize, connectionLabel), `web/src/app/api/ai/`(embed, summarize, connection-label 라우트), `web/src/state/aiGate.ts`·`useAIGate.ts`, `web/src/components/privacy/AIOptOutSettingsRow.tsx`·`AICallPreview.tsx`, `web/src/components/workspace/SystemBoard.tsx`와 `state/selectors/systemBoard.ts`.
- remove-ai 손볼 참조처: `WorkspaceShell.tsx` 16·171·202·210행 SignalsPanel, `Dock.tsx` 22·130·555행 onSignalsClick, `DraggableCard.tsx` 1142행 aiOptOut 표시·토글, `Canvas.tsx` 721행 `{false && …}`로 꺼 둔 SystemBoard 렌더, `state/workspace.ts` 209·1264행 aiOptOut, i18n `ko.json`의 `signals`·`ai`·`privacy` 키, `mcp/src/ai.ts`의 `ai_embed`·`ai_summarize`·`ai_connection_label` 도구. `server/preview` 링크 미리보기는 AI가 아니라 남긴다.
- remove-ai 남길 것: 시스템 보드 자체(`boards.isSystem`, `systemBoardMigration.ts`)와 `SystemBoardEmpty`는 기본 보드라 지우지 않는다. 수동 연결선(`connections` 테이블)도 남긴다.
- remove-ai 수용 기준 후보: (1) Dexie `embeddings` 테이블을 비우고 스키마에서 빼는 버전 올림. (2) `connections` 중 `source: "ai-suggested"`인 행을 어떻게 할지 — 수락된 것은 수동으로 바꿔 남기고, 제안 상태·거절 상태는 지운다. (3) `notes.aiOptOut` 인덱스와 `settings.aiOptOutGlobal` 필드 제거 시 마이그레이션. (4) `.moss` 번들 내보내기·가져오기에서 AI 필드가 들어와도 깨지지 않는다. (5) 지운 뒤 네트워크 탭에 `/api/ai/` 호출이 0건. (6) FEAT-freemium의 AI 쿼터 서술 정리.
