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
- hover 확대는 부모(Dock)가 `data-dock-id` 속성으로 각 버튼을 이벤트 핸들러 안에서만 조회해 40~72px로 보간(react-hooks/refs 린트 — 렌더 중 ref 접근 금지 대응). 이웃 아이콘 거리 falloff 90px, 라벨은 최근접 아이콘만.
- 가림 판정(AC-5)은 카드 스크린 좌표(viewport 변환)와 독 DOM rect의 사각형 교차로 계산. frame(판) 카드 자체는 판정 대상에서 제외(판 위에 독이 겹쳐도 옅어지지 않음 — spec이 "메모"로 한정하진 않았으나 판은 배경 레이어라 배제, **호출자가 정할 것**).
- 레이아웃 회피(줌 바·펜 툴바)는 실측 대신 RIGHT_TOOLBAR_RESERVED=210px 근사 상수로 구현 — 두 툴바 DOM을 직접 측정하지 않음. 픽셀 단위로 안 맞을 수 있음(**호출자가 정할 것**, 필요하면 실측 refs로 교체).
- 아이콘 88px 1벌만 생성(144px 2x 미생성 — 88>72 hover라 육안 확인 없이도 흐림 리스크 낮다고 판단, 실제 레티나 디스플레이 확인은 못 함).
- 실경로 검증: 이 환경에 브라우저 자동화 도구가 없어 dev 서버(3109) SSR HTML을 curl로 확인 — 독 5버튼(data-dock-id: frame/text/board/pen/signals) 렌더, `<aside>` 없음(SignalsPanel 것 1개는 별개), grid 1열 확인. hover 확대·드래그 생성·60fps 프레임 기록·시안 A1/A2 스크린샷 대조는 수행 못 함 — 사람이 브라우저로 확인 필요(**갭**).
- `tsc`/`vitest run`(전체)/`eslint`/`check-i18n` 모두 통과. vitest 전체는 기준선 그대로 7개 실패(Canvas.virtualization 1, CardContent.autoFocus 1, CardContent.image 5) — 새로 깨진 테스트 0.
