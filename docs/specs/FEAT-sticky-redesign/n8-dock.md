# n8-dock — 왼쪽 사이드바를 걷고 하단 독으로

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n7-frames (addFrameAt)
**상태**: done

## 문제

148px 사이드바가 캔버스 공간을 먹고, 도구 13개 중 실제 동작하는 건 끌어놓기·펜·시그널스뿐이다(line·column·comment·more·trash는 `Sidebar.tsx:82` 로컬 useState만 바꾼다).

## 목표

사이드바 DOM이 없고, 화면 아래 가운데에 늘 보이는 독(약 269×56px)이 있다: 메모판·메모·파일함 | 구분선 | 펜·시그널스. hover 시 맥 독식 확대, 독에서 한 번 끌면 생성.

## 작업

1. 아이콘: `web/public/icons/generated/{memoboard,memo,filebox}-office.png`(1254px)를 88px로 줄여 `web/public/icons/dock/`에. 72px 확대 시 흐리면 144px 추가본. 펜·시그널스는 `/icons/sidebar/draw-v2.png`, `signals-v2.png` 재사용.
2. `web/src/components/workspace/Dock.tsx` 신규 — `Sidebar.tsx`의 tryDrop 좌표 변환·시스템 보드 토스트 이식. 메모 → `addCardAt("text")`, 파일함 → `createSubcanvas`, 메모판 → n7 `addFrameAt`. 독 위에서 놓기·Esc → 생성 없음. 드래그 중 확대 유지.
3. 확대: 아이콘 40px, hover 72px, 이웃은 거리 비례, 이탈 후 200ms 안 복귀, 이름표. `prefers-reduced-motion` → 애니메이션 끄고 이름표만. 캔버스 폭 < 360px → 확대 끔.
4. 가림: 독 화면 영역과 겹치는 카드가 있으면 불투명도 0.6, hover 시 1.
5. 레이아웃: `web/src/app/page.tsx` grid에서 사이드바 열·`<Sidebar>` 제거, `<Dock>` 마운트, `SidebarDragPreview` → 독 드래그 프리뷰로 유지. 시그널스 패널 열리면 독은 남은 폭 가운데로. 줌 바·펜 툴바와 겹치면 왼쪽으로 비켜남. `web/src/design/tokens.ts` layout.sidebar 제거·layout.dock 추가.
6. `web/src/state/workspace.ts` `CAPTURE_TOOLS`를 `["text"]`로, `ToolId`에 `frame`. 기존 `Cmd+1~` 캡처 단축키가 깨지면 메모만 남기고 나머지는 제거(재매핑은 후속).
7. 접근성: 버튼 5개 Tab 순서, 한국어 aria-label, 포커스 후 Enter → 화면 가운데에 생성.
8. `Sidebar.tsx`와 사이드바 전용 테스트 삭제·이관.
9. 테스트 `web/src/components/workspace/__tests__/Dock.test.tsx`: 사이드바 DOM 없음·버튼 5개+구분선 순서(AC-1), hover 확대 크기(AC-2), 세 가지 드롭 생성·독 위 드롭/Esc 무생성(AC-3), 펜 토글·시그널스 열기(AC-4), 가림 불투명도(AC-5), Enter 생성.

## 완료 기준

- [x] plan 공통 완료 기준 전부 (tsc·vitest·eslint·i18n — 아래 구현 메모)
- [x] `cd web && npx vitest run src/components/workspace/__tests__/Dock.test.tsx` 통과 (17/17)
- [x] spec AC-1~AC-5 전 항목 (spec §10 통합 테스트 "사이드바 DOM이 없고 독 버튼이 5개")
- [x] `grep -rn "<Sidebar" web/src` 결과 0건
- [~] 실경로: dev 서버에서 세 가지 drop 생성·새로고침, hover 확대 60fps, 시안 A1·A2 대조 — 브라우저 자동화 도구가 없어 SSR HTML curl 확인까지만. 갭은 구현 메모 참고.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Sidebar.tsx` | 이식 원본(tryDrop, 펜·시그널스) |
| `web/src/components/workspace/SidebarDragPreview.tsx` | 드래그 프리뷰 |
| `web/src/app/page.tsx` | grid 레이아웃, Sidebar 마운트(25행 onSignalsClick) |
| `web/src/design/tokens.ts` | layout 토큰 |
| `web/src/components/workspace/ZoomBar.tsx` · `PenToolbar.tsx` | 오른쪽 아래 위치(겹침 확인) |
| `web/src/components/signals/SignalsPanel.tsx` | 오른쪽 420px 패널 |
| `web/src/state/workspace.ts` | ToolId·CAPTURE_TOOLS·addCardAt·createSubcanvas |
| `web/public/icons/generated/` | 세트 B 원본 아이콘 |

## 구현 메모

- 완료. `Dock.tsx` 신규(독 버튼 5개: 메모판·메모·파일함 | 구분선 | 펜·시그널스), `Sidebar.tsx`·`SidebarDragPreview.tsx` 삭제, `DockDragPreview.tsx`로 대체(이름에 "Sidebar"가 남으면 완료 기준의 grep이 걸려 개명— 기능은 동일).
- 독 드래그는 Sidebar.tsx와 동일하게 raw mouse event(mousedown/mousemove/mouseup)로 구현 — HTML5 dataTransfer API를 안 써서 Canvas.tsx의 OS 파일 드롭(n6, dataTransfer.types에 "Files")과 이벤트 자체가 겹치지 않는다. 충돌 방지를 위한 별도 분기 코드는 필요 없었다(둘이 서로 다른 이벤트 계열).
- `CAPTURE_TOOLS`를 `["text"]`로 축소, `ToolId`에 `frame` 추가. Cmd+2~ 단축키는 대상이 없어 자동으로 no-op(useShortcuts.ts 무변경, idx>=length 가드가 이미 있었음). 관련 테스트(ac-capture.test.ts, useShortcuts.test.tsx) 업데이트.
- 호버 성능: 라이브러리 `motion`(구 framer-motion, MIT, ^13.2.0) 도입 — mousemove마다 setState+버튼 5개 getBoundingClientRect+CSS width transition으로 매번 Dock 전체가 리렌더되던 것을 useMotionValue(커서 x)→useTransform(거리→40~72px)→useSpring으로 React 렌더 밖에서 DOM style에 직접 쓰게 바꿈(Build UI Magnified Dock 레시피 패턴). 버튼 중심은 enter·resize·signals 토글 후 첫 move에만 재서 캐시(확대분을 빼 평상시 좌표로), 이름표 대상이 바뀔 때만 렌더. jsdom mousemove 100회당 Dock 커밋 100→5(`Dock.perf.test.tsx`). react-spring도 MIT·React 19 호환이지만 레시피·공식 문서가 motion 쪽이 풍부해 선택.
- hover 확대는 부모(Dock)가 `data-dock-id` 속성으로 각 버튼을 이벤트 핸들러 안에서만 조회해 40~72px로 보간(react-hooks/refs 린트 — 렌더 중 ref 접근 금지 대응). 이웃 아이콘 거리 falloff 90px, 라벨은 최근접 아이콘만.
- 가림 판정(AC-5)은 카드 스크린 좌표(viewport 변환)와 독 DOM rect의 사각형 교차로 계산. frame(판) 카드 자체는 판정 대상에서 제외(판 위에 독이 겹쳐도 옅어지지 않음 — spec이 "메모"로 한정하진 않았으나 판은 배경 레이어라 배제, **호출자가 정할 것**).
- 레이아웃 회피(줌 바·펜 툴바)는 실측 대신 RIGHT_TOOLBAR_RESERVED=210px 근사 상수로 구현 — 두 툴바 DOM을 직접 측정하지 않음. 픽셀 단위로 안 맞을 수 있음(**호출자가 정할 것**, 필요하면 실측 refs로 교체).
- 아이콘 88px 1벌만 생성(144px 2x 미생성 — 88>72 hover라 육안 확인 없이도 흐림 리스크 낮다고 판단, 실제 레티나 디스플레이 확인은 못 함).
- 실경로 검증: 이 환경에 브라우저 자동화 도구가 없어 dev 서버(3109) SSR HTML을 curl로 확인 — 독 5버튼(data-dock-id: frame/text/board/pen/signals) 렌더, `<aside>` 없음(SignalsPanel 것 1개는 별개), grid 1열 확인. hover 확대·드래그 생성·60fps 프레임 기록·시안 A1/A2 스크린샷 대조는 수행 못 함 — 사람이 브라우저로 확인 필요(**갭**).
- `tsc`/`vitest run`(전체)/`eslint`/`check-i18n` 모두 통과. vitest 전체는 기준선 그대로 7개 실패(Canvas.virtualization 1, CardContent.autoFocus 1, CardContent.image 5) — 새로 깨진 테스트 0.

**3단계 리뷰 수정(2026-09-13)**:
- 독 폭 실측: DockButton 슬롯을 hover 크기(72px) 고정에서 `displaySize`(평상시 40px, hover로만 확대)로 바꾸고, 가운데·툴바 회피 계산은 `layout.dock.width` 토큰 대신 `dockRef` ResizeObserver 실측값(`dockWidth` state, jsdom 폴백은 `getBoundingClientRect()` 1회)을 쓴다 — 이전엔 슬롯이 항상 72px라 5버튼 실제 폭이 토큰(269)보다 약 413px로 커서 독이 오른쪽으로 치우쳤다.
- 가림 판정을 `cards`/`viewport` 훅 구독 + effect deps(`cards, viewport, canvasWidth`)에서 `cardOccludesDock` 순수 함수(export) + `useWorkspace.subscribe` + rAF 스로틀로 바꿨다. deps를 `[signalsOpen, effectiveCanvasWidth, dockWidth]`(독 위치가 실제로 바뀌는 계기)로 좁히고, 마운트 시 1회는 동기 계산(테스트가 즉시 확인 가능), 이후 스토어 변경마다 rAF 1프레임으로 묶어 재계산한다.
- 좌표 계산 단일화: 스토어에 `addFrameAtViewportCenter`·`createSubcanvasAtViewportCenter`(+ 공유 헬퍼 `viewportCenterScreenPoint`)를 추가해 Dock의 `createAtCenter`는 호출만 하도록 정리했다. `tryDrop`은 kind마다 다른 `-120` 하드코딩 대신 `widthForKind(kindForTool(toolId))/2`로 통일(frame 160·board 100·text 120).
- `sidebarDrag`/`setSidebarDrag`/`SidebarDrag` → `dockDrag`/`setDockDrag`/`DockDrag`로 개명(workspace.ts·Dock·DockDragPreview·Canvas·테스트).
- `DockDragPreview`가 frame·board에 `/cards/v2/{frame,board}.png`(존재하지 않음)를 참조하던 것을 `/icons/dock/{memoboard,filebox}.png`로 대체.
- `SignalsPanel.tsx`의 `PANEL_WIDTH`를 export해 Dock의 중복 `SIGNALS_PANEL_WIDTH` 상수를 제거.
- 드래그 중 창 밖으로 나가 blur가 발생하면(다른 탭/창으로 포커스 이동) mouseup 없이 드래그 상태가 남던 것을 `window.addEventListener("blur", ...)`로 정리하도록 추가.
- 미사용 CSS 변수 `--layout-sidebar-expanded`/`--layout-sidebar-collapsed` 제거.
