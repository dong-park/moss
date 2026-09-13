# n8-dock — 왼쪽 사이드바를 걷고 하단 독으로

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n7-frames (addFrameAt)
**상태**: pending

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

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/components/workspace/__tests__/Dock.test.tsx` 통과
- [ ] spec AC-1~AC-5 전 항목 (spec §10 통합 테스트 "사이드바 DOM이 없고 독 버튼이 5개")
- [ ] `grep -rn "<Sidebar" web/src` 결과 0건
- [ ] 실경로: dev 서버에서 독으로 세 가지를 끌어 만들고 새로고침, 독 hover 확대 성능 기록에서 긴 작업 0개, 독 비교 시안 A1·A2와 스크린샷 대조 — 결과를 `구현 메모`에

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

