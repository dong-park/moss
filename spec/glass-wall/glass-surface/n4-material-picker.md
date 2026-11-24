# n4-material-picker — 빈 벽 우클릭 '벽 재질…' 팝오버

> 자기완결 브리프. `spec/glass-wall/glass-surface/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

**agent**: runner
**id**: GS-4
**상위**: spec/glass-wall/glass-surface/spec.md
**deps**: n1-material-model, n3-wall-surface
**상태**: 아직 안 함
**담당 행**: T3, T4, T5, T6

## 문제

재질 데이터와 바탕은 있어도, 사용자가 재질을 바꿀 방법이 없다.

## 목표

빈 벽을 우클릭하면 '벽 재질…'이 있고, 누르면 카드 세 장 팝오버가 뜬다. 하나를 고르면 바탕만 바뀌고, 닫으면 아무것도 안 바뀐다.

## 확정된 결정

- D1 = A. 빈 벽 우클릭 메뉴 '벽 재질…' → 카드 세 장 팝오버. Dock에 상주 버튼을 두지 않는다. 태블릿은 빈 벽 길게 누르기가 우클릭과 같다.
- D2 = A. 고른 값은 보드 문서에 저장한다 (n1 `setWallMaterial`).
- 카드 문구는 시안 02 그대로: 유리 '기본 · 뒤가 비침', 화이트보드 '깨끗한 흰 면', 코르크 '따뜻한 질감'. 지금 재질 카드에 파란 선택 테두리 #2457b8, 4px, 4px 띄움.
- 스티커·테마·장식 선택지는 없다.

## 작업

1. 지금 캔버스에는 빈 벽 우클릭 메뉴가 없다. `Canvas.tsx`에 빈 영역 `contextmenu`를 받아 메뉴를 띄운다. 카드 위 우클릭은 기존 `DraggableCard.tsx` 메뉴가 그대로 받는다.
2. 새 파일 `web/src/components/workspace/wall/WallMaterialPicker.tsx`. n3 `WallMaterialSwatch`로 카드 세 장을 그리고, 같은 예시 내용 '오늘 생각'·포스트잇 둘·빨간 동그라미를 얹는다.
3. 카드를 누르면 `setWallMaterial`을 부르고 팝오버를 닫는다. 같은 재질을 누르면 닫기만 한다.
4. Esc나 바깥 누르기로 닫으면 아무것도 쓰지 않는다. 되돌리기 목록에 재질 변경 항목이 쌓이지 않는다 (T5). 고른 경우 되돌리기 한 번으로 이전 재질이 돌아온다.
5. 문구는 `web/src/i18n/messages/ko.json`에 `wall.material.*` 키로 넣는다.
6. 테스트: 새 파일 `web/src/components/workspace/wall/__tests__/WallMaterialPicker.test.tsx`.
   - 카드 세 장과 문구가 보이고, 현재 재질 카드에 선택 표시가 있다 (T3).
   - 화이트보드를 누르면 보드 `wallMaterial`이 바뀌고 note 좌표는 그대로다 (T4).
   - Esc로 닫으면 `wallMaterial`과 되돌리기 스택이 그대로다 (T5).
   - 카드 위 우클릭에서는 '벽 재질…'이 뜨지 않는다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- src/components/workspace/wall/__tests__/WallMaterialPicker.test.tsx src/components/workspace/__tests__/DraggableCard.frameSkinMenu.test.tsx` 통과
- [ ] `cd web && bun run check:i18n` 통과
- [ ] `cd web && bunx tsc --noEmit` 통과
- [ ] 실경로: 테스트가 실제 `Canvas` 우클릭 경로와 `workspace.ts` setter를 탄다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Canvas.tsx` | 빈 벽 우클릭 메뉴 추가 |
| `web/src/components/workspace/DraggableCard.tsx` | 카드 우클릭 메뉴, 겹치지 않게 |
| `web/src/i18n/messages/ko.json` | 문구 |
| `spec/glass-wall/mockups/02-materials.png` | 기준 화면 |
| `web/src/components/workspace/wall/WallMaterialSwatch.tsx` | n3 산출물 |

## 담당 행 메모

- T3, T4, T5, T6(UI 쪽)
