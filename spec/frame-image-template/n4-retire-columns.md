# n4-retire-columns — 세로 칸 스킨 걷기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: FT-4
**상위**: spec/frame-image-template/spec.md
**deps**: n3
**상태**: 아직 안 함
**담당 행**: T6
**사람 확인**: 불필요

## 문제

- 메뉴에서 판 모양이 빠지면 세로 칸 코드가 쓰이지 않는다.
- 이미 세로 칸으로 저장된 판이 남아 있을 수 있다.

## 목표

옛 세로 칸 판은 D4 답대로 읽는다(추천: 칸 그림 없이 그룹 선 판, `columns` 데이터 보존). 쓰이지 않는 스킨 코드와 테스트를 걷는다.

## 작업

1. `decodeFrameConfig`가 `skin: "columns"`를 만나도 화면은 그룹 선 판이다. 원본 content의 `columns`는 다시 쓸 때도 지우지 않는다.
2. `ColumnsSkin.tsx`·`frameSkins.ts`의 칸 폭 규칙, `setFrameSkin`·`addFrameColumn`·`renameFrameColumn`·`removeFrameColumn`, `FRAME_SKIN_MENU`, i18n `frameSkin` 키를 걷는다.
3. `resizeFrame`의 폭 상한은 "`max(1200, 지금 폭)`" 하나로 둔다. 2400까지 넓어진 옛 판이 줄어들지 않게 한다.
4. 걷은 기능의 테스트는 지우고, 옛 세로 칸 content를 읽는 하위 호환 테스트를 하나 남긴다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `rg -n 'ColumnsSkin|FRAME_SKIN_MENU|addFrameColumn' web/src`가 0건
- [ ] 옛 세로 칸 판(폭 1920, 칸 4개, 멤버 3)을 읽으면 폭·멤버 좌표·소속이 같고 칸 그림이 없다
- [ ] 이름을 바꾼 뒤에도 content의 `columns`가 남는다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/frameSkins.ts`, `web/src/state/frameContent.ts` | 스킨·칸 규칙 |
| `web/src/components/workspace/cards/frame/skins/ColumnsSkin.tsx` | 칸 그림 |
| `web/src/components/workspace/ResizeHandles.tsx` | `clampFrameWidth` 호출(170행) |
| `web/src/state/workspace.ts` | 칸 액션들 |

## 구현 메모
- (메인, 2026-10-18) 걷을 파일은 `rg -ln 'frameSkin|ColumnsSkin|FRAME_COLUMN' web/src` 9개에서 시작한다.

