# FEAT-pen-mode-ux · 펜 모드 UX 가시화

> 숨은 전역 모드를 항상 보이게 만들고, 어디에 그릴 수 있는지·지금 무슨 도구인지 화면에 드러낸다.

**Status**: ✅ complete (2026-06-05) — main 머지(펜 모드 HUD·툴바·affordance). 브라우저 QA: HUD「✏️ 펜 모드 · Esc 해제」+ 툴바 확인. ⚠️ 펜 모드 종료가 Esc 전용 — 클릭 종료 수단 후속 fix(아래 §0).
**Estimated**: M
**Owner**: (WS-B)
**Reference**: deep-interview UX 피드백 (2026-06-03) — B1/B2/B3

---

## 0. 잔여 작업 (브라우저 QA 발견, 2026-06-05)

- **펜 모드 종료가 Esc 키 전용** — 브라우저 실측에서 펜 도구 버튼 재클릭(2회 테스트)·툴바 닫기 모두 펜 모드를 끄지 못했고, `Canvas.tsx:156`상 Escape만 `setPenMode(false)`에 배선됨. HUD가 「Esc 해제」로 안내는 하나, Esc가 불편한 환경(태블릿·터치)에서 사용자가 펜 모드에 갇힐 수 있음.
- **제안 fix(S)**: HUD 배지 또는 펜 툴바에 클릭 가능한 "펜 모드 종료" 버튼 추가(→ `setPenMode(false)`). 본체는 머지 완료이므로 별도 small fix로 분리.

---

## 1. 목표 (Job Statement)

사용자가 / 펜 모드를 켰을 때 / "지금 펜 모드다 · 여기 그릴 수 있다 · 지금 이 도구·굵기다"를 화면에서 즉시 알아 / 모드를 잊어 카드가 안 움직이는 혼란과 잘못된 도구로 인한 실수 삭제를 피한다.

현재 펜 모드는 전역 모달 상태인데 신호가 사이드바 아이콘 active + 펜 커서뿐이고, `DraggableCard`가 `if (penMode) return`으로 드래그·편집을 전면 차단해 "모드를 잊으면 멈춘 줄 안다"는 고전 안티패턴("don't mode me in")이 있다.

## 2. 범위

### 포함 (in-scope)
- **B1 숨은 모드 가시화**: 펜 모드 중 상시 HUD/배너("✏️ 펜 모드 · Esc 해제") 또는 캔버스 보더 강조. 신규 `PenModeHud`.
- **B2 그릴 수 있는 곳 affordance**: 펜 모드 진입 시 메모(text) 카드에 미세 하이라이트, 비메모 카드 위 커서 `not-allowed`.
- **B3 도구·굵기 HUD**: 현재 펜/지우개 + 굵기를 보여주는 작은 툴바(`PenToolbar`). `E`/`[`/`]` 단축키도 노출.

### 제외 (out-of-scope, 다른 단위 담당)
- 그리기 코어·좌표·점 저장 — [[FEAT-pen-drawing-engine]]가 소유(읽기만).
- `workspace.ts` 펜 상태 **액션 추가/변경 금지** — 기존 `penMode/penTool/penWidth` 읽기 전용.
- placeholder 학습성 — [[FEAT-memo-learnability]].

## 3. 수용 기준 (Acceptance Criteria, GWT)

### AC-1 (B1) 상시 가시화
- **Given** 펜 모드 ON
- **When** 캔버스를 본다
- **Then** "펜 모드 · Esc 해제" HUD가 상시 보이고, OFF 시 사라진다.

### AC-2 (B2) 그릴 수 있는 곳
- **Given** 펜 모드 ON
- **When** 커서를 메모 카드 / 비메모 카드(image 등) 위로 이동
- **Then** 메모 카드는 그릴 수 있음을 하이라이트로 표시하고, 비메모 카드 위에선 커서가 `not-allowed`로 바뀐다.

### AC-3 (B3) 도구·굵기 표시
- **Given** 펜 모드 ON
- **When** `E`로 지우개 토글, `[`/`]`로 굵기 변경
- **Then** 툴바가 현재 도구(펜/지우개)와 굵기를 즉시 반영한다.

## 4. 의존성

### 다른 feature
- **의존**: [[FEAT-pen-drawing-engine]] — 수렴 엔진의 `tool`/`penWidth` 시그니처를 읽어 B3 툴바가 표시(엔진 API 확정 후 props 정합). 단 그리기 동작 자체엔 비의존이라 **병렬 시작 가능**.

### 코드 기준점
- 신규: `web/src/components/workspace/PenModeHud.tsx`, `PenToolbar.tsx`
- `web/src/components/workspace/Canvas.tsx` (펜 커서·HUD 마운트)
- `web/src/components/workspace/DraggableCard.tsx` (affordance className/cursor — 기존 `if (penMode) return` 가드 유지)
- 읽기 전용: `web/src/state/workspace.ts` (`penMode`·`penTool`·`penWidth`)

## 5. 데이터 모델

변경 없음. 기존 전역 상태만 구독.

## 6. 인터페이스

### 컴포넌트 props
- `<PenModeHud />` — 내부에서 `useWorkspace(s => s.penMode)` 구독, ON일 때만 렌더.
- `<PenToolbar />` — `penTool`·`penWidth` 구독 표시. 클릭으로 토글 시 **기존** `setPenTool`/`setPenWidth` 호출(신규 액션 금지).

### 조율 경계 (충돌 방지)
- `text/Content.tsx`를 만질 경우 **카드 chrome(wrapper className/보더/커서) 영역만**. 카드 내부 그림 렌더 JSX는 [[FEAT-pen-drawing-engine]] 소유 — 건드리지 않음.
- 머지 순서: WS-A → **WS-B** → WS-C.

## 7. 시각·인터랙션

- HUD: 상단 또는 캔버스 하단 고정, 저채도(calm) 톤, Esc 안내 포함.
- affordance: 메모 카드 점선/들뜬 그림자 등 미세 신호(과하지 않게).
- 툴바: 펜/지우개 토글 + 굵기 미리보기 점. 위치는 ZoomBar 근처 권장.

## 8. 비기능 요구사항

- **성능**: 상태 구독은 selector 단위(penMode/penTool/penWidth 개별) — 불필요 리렌더 회피.
- **접근성**: 툴바 버튼 `aria-pressed`, 키보드 도달. HUD는 `role="status"`.
- **i18n**: HUD·툴바 라벨 `ko.json` 키 추가(`workspace.pen.*`).

## 9. 다음 iteration (의도적 보류)

- 색상 팔레트 UI — 단색 먼저([[FEAT-markdown-memo-pen]] §9).
- 굵기 슬라이더 — `[`/`]` + 미리보기 점 먼저.

## 10. 검증 방법 (DOD)

- [ ] tsc/eslint 클린, `check:i18n` 통과
- [ ] 브라우저 실측: 펜 모드 ON→HUD 상시(AC-1), 메모/비메모 커서 분기(AC-2), E/[/] 툴바 반영(AC-3)
- [ ] `workspace.ts`에 신규 액션 추가 안 됨 (`git diff` 확인)
- [ ] 자기 파일 외 변경 없음 (특히 `text/Content.tsx`는 chrome 영역만)
