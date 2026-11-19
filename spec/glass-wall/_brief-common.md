# 유리벽 티켓 스펙 — 공통 브리프

이 파일은 유리벽 줄기 티켓 스펙을 쓰는 spec-writer들이 공유하는 브리프다. 각자 맡은 티켓은 개별 브리프 끝에 적혀 있다.

## 작업
- 레포: /Users/dongpark/moss
- 줄기 README: `/Users/dongpark/moss/spec/glass-wall/README.md` — 먼저 읽는다. 맡은 티켓의 행(한 줄 목표·새로/기존 위에·겹침·우선순위)과 구조 결정, 구현 메모가 기준이다.
- **형식: rows 형식.** `spec/glass-wall/<슬러그>/spec.md` + `spec/glass-wall/<슬러그>/rows/*.json`. 행 규칙은 `~/.claude/skills/spec/rows.md`.
- 머리 표: `상위` = `../README.md`(또는 `spec/glass-wall/README.md`), `상위문제` = 아래 값을 그대로 복사.
  > 손으로 쓰고 붙이며 공간에 생각을 펼치고 싶은 사람에게 맞는 개인용 벽이 없다 — 화이트보드 도구는 팀용이라 과하고, 메모앱은 시각적이지 않고, 종이와 포스트잇은 흩어져 다시 못 찾는다
- 사용자 요청: "시안대로 스펙을 만들어보자". **시안이 기준 화면이다.** 시안에 보이는 것을 수용 기준(작업 행 given/when/then)으로 옮긴다. 시안에 없거나 흐린 것은 결정 행(추천값 포함)으로 쓴다. 채팅 질문은 못 한다.
- 다른 티켓 범위를 침범하지 않는다. 겹치면 "다른 티켓 몫"으로 적는다.

## 시안 (반드시 Read로 열어 볼 것)
`/Users/dongpark/moss/spec/glass-wall/mockups/` — PNG 12장, 생성 소스 `gen.py`(HTML/CSS 값: 유리 투명도, 포스트잇 색, 마카 색 #1f2430 #2457b8 #d0453c #2f8a57, 손글씨 폰트 Nanum Pen Script 등).
- 01-main: 유리벽 메인. 뒤 방이 흐릿하게 비침, 사선 반사광. 마카 제목+밑줄, 빨간 동그라미, 화살표, 장단점 T표, 초록 점선. 포스트잇 5색 기울어짐. 오른쪽 메모판=벽에 걸린 코르크판 구역(핀 꽂힌 포스트잇, "나중에 볼 것" 라벨). 아래 중앙 마카 트레이(4색 마카, 집은 마카는 들림, 천 지우개). 오른쪽 위 "🔒 이 기기에만" 배지.
- 02-materials: 재질 3종 유리(기본, 선택 테두리)·화이트보드·코르크. 같은 내용이 재질만 바뀜.
- 03-first-a/b: 첫 진입. 빈 유리벽+트레이+힌트 한 줄 "마카를 집거나, 아무 데나 두 번 눌러 포스트잇". 로그인·보드 고르기 없음. b: 첫 마카 획과 첫 포스트잇.
- 04-marker: 굵기 3단, 색 4개, 획 끝 번짐, 천으로 닦으면 옅은 자국. 마카 패널(색·굵기·지우개 설명).
- 05-sticky-a/b: 마카 동그라미·화살표는 벽 그림. 포스트잇을 옮기면 벽 그림은 제자리, 포스트잇 위 밑줄은 따라감.
- 06-share: 공유 버튼 → 시트 "이 벽을 공유할까요? 공유하면 이 벽은 moss 서버에 올라갑니다. 다른 벽은 그대로 이 기기에만 있어요." [Google로 로그인하고 공유] [취소].
- 07-phone: 다른 앱 공유 시트에서 moss → "✓ 벽에 붙였어요 · 이직 고민" → 휴대폰 벽 보기(보기 전용 안내, 방금 붙은 포스트잇).
- 08-zoom: 25% 축소. 마카로 쓴 덩어리 이름 "커리어 (14)" 등과 포스트잇 무리만. 줌 컨트롤.
- 09-search: ⌘K, `ㅇㅈ` → 이직/연주/인재 하이라이트, 결과에 벽 이름, 하단 "초성·부분 일치 · 마카 글씨는 검색하지 않아요".
- 10-wipe: 벽 닦기 + 오른쪽 "벽 사진첩" 폴라로이드 3장(날짜·벽 이름).

## 확인된 사실 (이 세션이 직접 확인)
1. 현재 펜 획은 메모 카드 안에만 그려진다(spec-writer 조사). 그리기 엔진은 `useDrawing` 단일 엔진 + `DrawingLayer` (FEAT-pen-drawing-engine, 완료). 펜 모드 HUD·툴바는 FEAT-pen-mode-ux.
2. 포스트잇 = 메모 카드(FEAT-sticky-redesign "겉은 포스트잇, 안은 문서", 완료). 끌 때 흔들림 FEAT-drag-tilt. 메모판(frame) 자석 손맛 FEAT-frame-feel, 메모판 배경 스킨 FEAT-frame-skins. 메모 색 5개 `spec/memo-color.md`.
3. 웹 컴포넌트: `web/src/components/workspace/` 에 Canvas.tsx, Dock.tsx, FirstBoardChooser.tsx, MemoSearchLayer.tsx, PenToolbar.tsx, PenModeHud.tsx, ZoomBar.tsx, useVirtualizedCards.ts, SystemBoard.tsx, WorkspaceShell.tsx. 줌 LOD는 커밋 안 된 `cards/_shared/zoomLod.ts`(메모만 다룸).
4. i18n 한국어 `web/src/i18n/messages/ko.json`. 현재 온보딩 문구 "첫 보드를 골라 주세요 / 예제로 시작 / 빈 보드로 시작".
5. 공유·공동 편집은 FEAT-collab-auth(Yjs, Google 로그인, 공유 보드 서버 평문 저장) 완료. 사용자 결정: 개인 사고 우선, 협업은 보너스. 로그인은 공유를 고를 때만.
6. 사용자 결정(줄기 구조 결정에 기록됨): 캔버스 전체가 유리벽 / 재질은 유리·화이트보드·코르크 몇 개, 기본 유리, 스티커·테마 없음 / 펜과 마카는 한 도구 / 마카 화살표는 그림으로만, 기존 연결선은 따로 유지 / 메모판은 벽 위 구역으로 남음 / 휴대폰은 붙이기+보기만 / AI 기능은 코드까지 지움(remove-ai).
7. 현재 브랜치 feat/card-clipboard, 마지막 커밋 fe1c961. 이 작업은 문서만 쓴다. 커밋하지 않는다.

## 정하지 않음
시안이 보여 주지 않는 세부(정확한 수치, 키보드 단축키, 태블릿 펜 압력, 저장 형식 등)는 결정 행으로. 되돌리기 쉬우면 reversible: true.

## 돌려줄 것
spec.md 절대경로, 작업 행 수, 결정 행 수(그중 reversible:false 개수), 다른 티켓과 겹친다고 적은 것 한 줄.
