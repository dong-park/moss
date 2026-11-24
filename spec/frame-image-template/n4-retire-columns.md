# n4-retire-columns — 세로 칸 스킨 걷기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다. `**상태**:` 줄은 손으로 고치지 않는다 — 멈추면 `spec-board node block`, 사람 확인이 필요하면 `spec-board node review`.

**agent**: runner
**id**: FT-4
**상위**: spec/frame-image-template/spec.md
**deps**: n3
**상태**: 끝남
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

- (runner n4, 2026-10-18) 걷은 것: `state/frameSkins.ts`, `ColumnsSkin.tsx`와 테스트 2개(ColumnsSkin·frameSkins), store의 `setFrameSkin`·`add/rename/removeFrameColumn`, i18n `frameSkin` 블록, Canvas의 `--frame-zoom`(칸 이름표 전용이라 고아가 됨). `FRAME_SKIN_MENU`는 n3에서 이미 사라져 있었다.
- `clampFrameWidth(currentWidth, nextWidth)`는 `workspace.ts`로 옮겼다(최소 240, 최대 `max(1200, 지금 폭)`). `ResizeHandles`와 `resizeFrame`이 같은 함수를 쓴다.
- `frameContent.ts`는 `skin`·`columns`를 읽지 않고 `unknown`으로 두어 `encodeFrameContent`가 원본 그대로 다시 쓴다(옛 코드는 깨진 칸 목록을 기본 3칸으로 바꿔 썼다). `decodeFrameConfig`는 `{name, bg}`만 돌려준다.
- 테스트: `frameLegacyColumns.test.ts`(폭 1920·칸 4개·멤버 3 읽기, 이름 변경 뒤 columns 보존, 폭 한계), `Content.bg.test.tsx`(칸 그림 없음), `frameSkinRoundTrip`·`frameContent`·`frameBackground` 테스트를 새 규칙에 맞춰 고침.
- 검증: `tsc --noEmit` 통과, `eslint` 통과, `vitest run` 전체 180파일 1440 통과. 첫 전체 실행에서만 `mossBridge.test` unhandled rejection(DatabaseClosedError) 6건이 떴고 같은 코드 기준선에서도 1건이 떠 흔들리는 기존 현상이다(재실행 0건). 이 노드가 쓴 증거는 단위 테스트뿐이다 — 실브라우저에서 옛 세로 칸 판을 열어 보는 확인은 n6 몫.
