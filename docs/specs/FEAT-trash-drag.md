# FEAT-trash-drag · 휴지통으로 끌어서 버리기

> 카드를 집어 독 끝의 휴지통 위에 놓으면 지워진다. Delete 키를 찾지 않아도 된다.

**Status**: spec 작성
**Owner**: dong-park
**Estimated**: S
**Blueprint**: (신규 — [[FEAT-trash]] §9 첫 항목의 후속)

---

## 1. 목표 (Job Statement)

캔버스에서 카드를 옮기던 사용자가 / 그 카드가 더 필요 없다고 느낀 순간 / 독의 휴지통 위에 놓아 바로 버리고 싶다 / 지금은 손을 키보드로 옮겨 Delete를 눌러야 하기 때문.

## 2. 범위

### 포함 (in-scope)
- 캔버스 카드를 끌어 휴지통 버튼 위에 놓으면 지운다. 종류별 결과는 Delete 키와 같다.
- 메모는 휴지통으로 간다. 판은 즉시 지워지고 안의 메모는 제자리에 남는다. 함은 하위 보드까지 지우고 5초 undo 토스트를 띄운다.
- 여러 장을 선택해 끌어 놓으면 선택 전부가 지워진다.
- 끄는 중 휴지통 위에 오면 휴지통 버튼이 강조된다. 벗어나면 강조가 풀린다.
- 놓으면 끌던 카드가 휴지통으로 빨려 들어가는 모션이 나온다. 함 흡수와 같은 240ms 모션이다.

### 제외 (out-of-scope)
- **휴지통 목록에서 캔버스로 끌어 복구하기** — 복구는 패널의 버튼만. [[FEAT-trash]] AC-5
- **판을 버릴 때 안의 메모를 함께 휴지통으로** — 판 삭제 규칙은 그대로다. [[FEAT-trash]] §9
- **휴지통 버튼 자체를 끌기** — 버튼은 계속 고정이다.
- **드롭 전 확인 다이얼로그** — Delete 키에도 없다. 휴지통이 되돌리기다.
- **터치·펜 입력** — 카드 드래그가 마우스 이벤트만 쓴다. 입력 확장은 별도 feature.

## 3. 수용 기준 (Acceptance Criteria)

### AC-1 — 메모 한 장
- **Given** 캔버스에 메모 한 장이 있을 때
- **When** 메모를 끌어 독의 휴지통 버튼 위에서 놓는다
- **Then** 메모가 캔버스에서 사라지고 휴지통 목록 맨 위에 나타난다. 결과는 그 메모를 선택하고 Delete를 누른 것과 같다. 휴지통 배지 점이 켜진다.

### AC-2 — 판 한 장
- **Given** 메모 2장을 담은 판이 있을 때
- **When** 판을 끌어 휴지통 위에서 놓는다
- **Then** 판만 즉시 사라진다. 메모 2장은 제자리에 남고 판 소속이 풀린다. 휴지통 목록에는 아무것도 늘지 않는다.

### AC-3 — 함 한 장
- **Given** 하위 보드가 딸린 함 카드가 있을 때
- **When** 함을 끌어 휴지통 위에서 놓는다
- **Then** 함과 하위 보드가 사라지고 5초 undo 토스트가 뜬다. 토스트에서 되돌리면 전부 돌아온다. 휴지통 목록에는 늘지 않는다.

### AC-4 — 여러 장 선택
- **Given** 메모 3장과 판 1장과 함 1장을 함께 선택했을 때
- **When** 그중 하나를 잡아 끌어 휴지통 위에서 놓는다
- **Then** 선택 5장이 전부 처리된다. 메모 3장은 휴지통, 판은 즉시 삭제, 함은 cascade와 5초 undo다. 이는 그 선택 상태에서 Delete를 누른 것과 같다.

### AC-5 — 강조
- **Given** 카드를 끌고 있을 때
- **When** 커서가 휴지통 버튼 안에 들어온다
- **Then** 휴지통 버튼에 연두색 배경이 깔리고 1.08배 커진다. 커서가 나가면 16ms 안에 원래대로 돌아온다. 끌지 않을 때는 버튼 위에 커서가 있어도 강조되지 않는다.

### AC-6 — 강조 우선순위
- **Given** 단일 메모를 끌고 있을 때
- **When** 커서가 휴지통 위에 있다
- **Then** 함 흡수 강조와 브레드크럼 강조는 켜지지 않는다. 휴지통 강조만 켜진다. 독과 브레드크럼은 화면 위아래로 떨어져 있어 실제로 겹치지 않지만, 겹쳐도 휴지통이 이긴다.

### AC-7 — 드롭 모션
- **Given** 카드를 휴지통 위에서 놓았을 때
- **When** 브라우저가 WAAPI를 지원한다
- **Then** 끌던 카드가 휴지통 버튼 중심으로 240ms 동안 작아지며 사라지고 버튼이 260ms 동안 한 번 튄다. 모션이 끝난 뒤 삭제가 실행된다. 여러 장 선택이면 잡았던 카드 1장만 날아가고 나머지는 삭제 시점에 함께 사라진다. WAAPI가 없으면 모션 없이 즉시 삭제한다.

### AC-8 — 놓기 실패
- **Given** 카드를 끌다가 휴지통 위를 지났지만
- **When** 휴지통 밖에서 놓는다
- **Then** 카드는 놓은 자리에 남고 아무것도 지워지지 않는다. 휴지통 강조는 꺼진다.

### AC-9 — 패널과 클릭
- **Given** 카드를 휴지통 위에서 놓았을 때
- **When** 마우스를 뗀다
- **Then** 휴지통 패널은 열리지 않는다. 버튼을 누르지 않고 카드에서 누르기 시작했기 때문이다. 패널이 이미 열려 있었다면 목록이 새 메모를 포함해 다시 그려진다.

### AC-10 — 키보드 경로 무영향
- **Given** 이 기능이 들어간 뒤
- **When** 기존 Delete 키·메뉴·브리지 삭제를 쓴다
- **Then** 동작이 전과 같다. 기존 workspace·mossBridge·TrashPanel 테스트가 그대로 통과한다.

## 4. 의존성

### 다른 feature
- **의존**: [[FEAT-trash]] — 휴지통 저장소와 독 버튼, `remove`·`removeSelected`의 종류별 분기. [[FEAT-subcanvas]] — 함 흡수 탐지와 모션 패턴. [[FEAT-eject]] — 브레드크럼 탐지 패턴, 같은 모양을 셋째로 늘린다. [[FEAT-drag-tilt]] — 놓기 직전 각도를 모션 첫 프레임으로 쓴다.
- **의존받음**: 없음.

### 외부 라이브러리·API
- 추가 없음. `document.elementsFromPoint`와 WAAPI는 이미 쓰고 있다.

## 5. 데이터 모델

영속 데이터 변화 없음. 삭제는 기존 `remove`·`removeSelected`를 그대로 부른다.

Store에 transient 값 하나가 는다.

```ts
dropTargetTrash: boolean;          // 끌던 카드가 휴지통 위에 있는가. 기본 false.
setDropTargetTrash: (v: boolean) => void;
```

`dropTargetFunnelId`·`dropTargetCrumbId`와 같은 성격이다. 보드를 바꾸거나 드래그가 끝나면 false로 돌아간다.

## 6. 인터페이스

### DraggableCard
- `findTrashUnder(clientX, clientY): boolean` — 커서 아래 요소 중 `[data-dock-id="trash"]` 조상이 있으면 true. `findCrumbUnder`와 같은 모양이다.
- 탐지는 **세 드래그 모드 전부**에서 돈다. 단일·다중·판 단독. 함과 크럼 탐지는 지금처럼 단일 메모일 때만 돈다.
- 휴지통 위면 함·크럼 탐지 결과를 버린다. 강조는 하나만 켠다.
- `runTrash()` — 놓았을 때 모션 뒤 삭제. 잡은 카드가 다중 선택의 일부면 `removeSelected()`, 아니면 `remove(card.id)`. 모션 대상은 `containerRef` 카드 1장과 휴지통 버튼이다.
- 놓을 때 hover 상태와 `dropTargetTrash`를 항상 false로 되돌린다. 실패 경로 포함.

### Store (Zustand)
- `dropTargetTrash`, `setDropTargetTrash` 추가. 보드 전환 시 초기화 목록에 포함.

### Dock
- 휴지통 `DockButton`에 `dropTarget` 표시가 는다. `dropTargetTrash`를 읽어 연두 배경과 1.08배 확대를 그린다. 배지와 라벨은 그대로다.
- 항목 주석의 "다음 iteration" 문구를 지운다. `draggable: false`는 유지한다.

### TrashPanel
- `trashCount`가 바뀌면 목록을 다시 조회한다. 패널이 열린 채로 드롭해도 목록이 맞는다.

## 7. 시각·인터랙션

- 강조 색은 브레드크럼 드롭 강조와 같은 연두다. 한 앱에서 "여기 놓아도 된다"는 신호가 한 색이어야 한다.
- 확대는 독의 hover 확대와 겹칠 수 있다. 둘 다 적용되면 hover 크기에 1.08을 곱한 크기다. 튀지 않게 transition 120ms.
- 드롭 모션은 함 흡수와 같다. 카드는 버튼 중심으로 translate하며 0.12배로 줄고 투명해진다. 버튼은 1.08배로 한 번 튄다.
- 함을 버릴 때 5초 undo 토스트는 Delete 키 때와 같이 뜬다. 드래그 경로라고 다르게 하지 않는다.
- reduced-motion 설정이면 기울기 모션이 이미 꺼진다. 드롭 모션은 함 흡수와 같은 규칙을 따른다.

## 8. 비기능 요구사항

- **성능**: `elementsFromPoint` 호출이 mousemove마다 최대 3번이다. 기존 2번에 1번 는다. 다중·판 드래그는 0번에서 1번이 된다. 프레임 예산 안이다.
- **접근성**: 마우스 전용 보조 경로다. Delete 키와 패널 버튼이 키보드 경로로 남는다. 강조는 색과 크기 둘 다 바꿔 색약에도 보인다.
- **데이터 무결성**: 삭제 호출은 기존 액션 그대로다. 새 저장 경로를 만들지 않는다.
- **i18n**: 새 문구 없음.

## 9. 다음 iteration (의도적 보류)

- 휴지통 목록에서 캔버스로 끌어 복구.
- 터치·펜으로 끌어 버리기.
- 판을 버릴 때 안의 메모도 휴지통으로. [[FEAT-trash]] §9와 같은 항목.

## 10. 검증 방법 (DOD)

- [ ] `DraggableCard.trashDrop.test.tsx`: AC-1·AC-2·AC-4·AC-6·AC-8. jsdom이라 WAAPI 없이 즉시 삭제 경로를 본다. 다중 선택은 `removeSelected`가 1번 불리고 `remove`는 안 불린다.
- [ ] `Dock.test.tsx`: `dropTargetTrash`가 true면 휴지통 버튼에 강조 클래스가 붙고 false면 없다.
- [ ] `workspace.test.ts`: `setDropTargetTrash`와 보드 전환 시 초기화.
- [ ] `TrashPanel.test.tsx`: 열린 채 `trashCount`가 바뀌면 `listTrash`를 다시 부른다.
- [ ] 수동: 메모·판·함·다중 선택 4가지를 끌어 버리고 결과가 Delete와 같은지 확인. 함은 토스트에서 되돌려 본다.
- [ ] 수동: 휴지통 위를 지나쳐 다른 곳에 놓기. 강조가 남지 않는다.
- [ ] 기존 테스트 전부 그린. 캔버스 가상화 테스트 1건은 main에서도 실패라 제외.

## 구현 메모

- 작업 위치: worktree `/Users/donghwan/poc-trash-drag/moss` 브랜치 `feat/trash-drag`. base `origin/main` b298c0f. 원 트리 `/Users/donghwan/poc`에는 '메모 정사각형' 미커밋 작업이 있어 건드리지 않는다.
- node_modules: `/Users/donghwan/poc/moss/web/node_modules`를 심볼릭 링크로 쓴다. 테스트는 `moss/web`에서 `npx vitest run`.
- 탐지 원형: `web/src/components/workspace/DraggableCard.tsx` `findCrumbUnder`(230). `elementsFromPoint` + `closest("[data-crumb-board-id]")`. 휴지통은 `closest('[data-dock-id="trash"]')`. 버튼 DOM은 `Dock.tsx` DockButton 562에 이미 `data-dock-id={item.toolId}`가 있어 속성 추가가 필요 없다.
- 탐지 위치: `onMove`(348). 지금은 `d.multi`(363)·frame(369) 분기에 hover 탐지가 없고 단일 분기(377)에만 crumb·funnel이 있다. 휴지통 탐지는 분기 앞에서 공통으로 돌리고, 단일 분기의 crumb·funnel은 `!trash`일 때만 돌린다.
- 놓기: `onUp`(496). crumb(520)·funnel(528) 분기 앞에 trash 분기를 둔다. `d.multi`와 무관하게 실행한다.
- 모션 원형: `runAbsorb`(402). 대상 요소만 `document.querySelector('[data-dock-id="trash"]')`로 바꾼다. onfinish에서 `remove`/`removeSelected`를 부르고, 카드가 state에 남으면 `anim.cancel()`과 `releaseLift()`. 함 undo로 카드가 돌아오는 건 새 마운트라 무관하다.
- Store: `workspace.ts` `dropTargetCrumbId`(471) 옆에 boolean 추가. 초기값(1078)·setter(1990)·보드 전환 초기화(2108·2167) 4곳.
- Dock: `Dock.tsx` 64-65 주석 갱신. 휴지통 DockButton(402-411)에 `dropTarget={dropTargetTrash}` 전달. 색은 `Breadcrumb.tsx` 55의 `bg-accent-lime/30`.
- TrashPanel: `TrashPanel.tsx` 102·109의 useEffect 중 하나에 `trashCount` 의존을 더한다.
- 삭제 액션: `workspace.ts` `remove`(1772) 판→deleteFrame, 함→cascade, 메모→trashNote. `removeSelected`(1801) 같은 분기. 둘 다 `refreshTrashCount`까지 부른다.
- 추천으로 정한 것 2가지: 다중 선택 드롭 모션은 잡은 카드 1장만 날린다. 함 드롭 시 5초 undo 토스트는 그대로 뜬다. 둘 다 코드가 0줄 늘어나는 쪽이다.

---

## Plan: 휴지통으로 끌어서 버리기

**한 줄로**: 카드를 끄는 동안 휴지통 위인지 살피고, 거기서 놓으면 Delete와 같은 삭제를 부른다.

1. **끌어서 버리기 본체** ← 요청 해결 단계. 끄는 중 휴지통 감지, 강조, 놓으면 모션 뒤 삭제.
2. **열린 패널 갱신** — 패널이 열린 채 버려도 목록이 바로 맞게.

진행: 1 → 2.

<!-- STEP:0:trash-drop:completed -->
### T-0: DraggableCard 휴지통 탐지·드롭 + store 플래그 + Dock 강조

#### 읽을 파일
- `web/src/components/workspace/DraggableCard.tsx` — findCrumbUnder(230), onMove(348), runAbsorb(402), onUp(496)
- `web/src/state/workspace.ts` — dropTargetCrumbId(471·1078·1990·2108·2167), remove(1772), removeSelected(1801)
- `web/src/components/workspace/Dock.tsx` — 휴지통 항목(64-65), DockButton(402-411·562)

#### 작업
§6 인터페이스 그대로. findTrashUnder·runTrash, `dropTargetTrash`/`setDropTargetTrash`, Dock 휴지통 버튼 `dropTarget` 강조.

#### AC
```bash
cd web && npx vitest run src/components/workspace/__tests__/DraggableCard.trashDrop.test.tsx src/components/workspace/__tests__/Dock.test.tsx src/state/__tests__/workspace.test.ts
cd web && npx vitest run && npx tsc --noEmit
```

#### 금지사항
- 함·크럼 탐지 조건(단일 메모 한정)을 넓히지 마라. 이유: 범위 밖이다.
- 새 삭제 경로를 만들지 마라. 이유: remove·removeSelected 재사용이 결정이다.

- summary: findTrashUnder·runTrash, dropTargetTrash store 4곳, Dock 휴지통 dropTarget 강조(연두+1.08). trashDrop/Dock/workspace 테스트 추가.
<!-- /STEP -->

<!-- STEP:1:panel-refresh:completed -->
### T-1: TrashPanel이 trashCount 변화에 재조회

#### 읽을 파일
- `web/src/components/workspace/TrashPanel.tsx` — useEffect(102·109)

#### 작업
열린 동안 `trashCount`가 바뀌면 `listTrash` 재조회.

#### AC
```bash
cd web && npx vitest run src/components/workspace/__tests__/TrashPanel.test.tsx
```

#### 금지사항
- 폴링을 넣지 마라. 이유: trashCount가 이미 변화 신호다.

- summary: 열림 effect 의존성에 trashCount 추가. TrashPanel.test에 재조회 케이스 추가.
<!-- /STEP -->
