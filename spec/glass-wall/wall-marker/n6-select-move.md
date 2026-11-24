# n6-select-move — 벽 획을 끌어 고르고 옮기기

> 자기완결 브리프. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: WM-6
**상위**: spec/glass-wall/wall-marker/spec.md
**deps**: n4-wall-layer
**상태**: 진행
**담당 행**: T17, T18, T19

## 문제

벽에 쓴 제목 자리가 마음에 안 들면 지우고 다시 써야 한다.

## 목표

마카를 내려놓은 채 빈 벽을 끌면 고르기 상자가 생기고, 닿은 벽 획이 묶인다. 묶음을 끌면 옮겨지고, Esc면 제자리로 돌아간다. 담당 행: T17, T18, T19.

## 확정된 결정 (그대로 따른다)

- D13 사용자 답: 마우스로 쭉 끌어 고르고 옮긴다, 피그마처럼.
- 상자에 조금이라도 닿은 벽 획이 잡힌다. 포스트잇 획은 따로 잡히지 않는다.
- 마카나 천을 집으면 묶음이 풀린다. 빈 벽 한 번 누르기로도 풀린다.
- 놓은 순간 새 위치를 한 번 저장한다. 공유 보드에서는 지운 쪽이 이긴다.
- 포스트잇과 벽 획을 한 상자로 함께 고르는 일은 marker-meets-sticky 몫이다. 이 노드는 벽 획만 다룬다. 지금 상자가 카드도 잡는 동작은 그대로 두고, 벽 획 묶음을 따로 둔다.
- 옮기기 되돌리기는 정하지 않았다. 이 노드는 만들지 않는다.

## 작업

1. `Canvas.tsx`의 기존 `marquee`가 끝날 때 상자와 닿은 벽 획 id를 고른다. 판정은 획 경계 상자로 거른 뒤 점·선분으로 확인한다.
2. 묶음 테두리 상자를 `WallStrokeLayer`에 그린다.
3. 묶음 안을 끌면 미리보기로 옮기고, 놓으면 n1 `moveWallStrokes`를 한 번 부른다. Esc면 미리보기를 버린다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bunx vitest run src/components/workspace/__tests__/WallStrokeSelect.test.tsx` 통과. 테스트: 상자가 두 획에 닿고 하나에 안 닿으면 두 개만 묶인다 (T17), 빈 벽 한 번 누르기로 풀림, 끌어 놓으면 모든 점이 같은 dx·dy만큼 옮겨져 Dexie에 저장 (T18), 끄는 중 Esc → 저장값 그대로·묶음 유지 (T19), 마카를 집으면 묶음 풀림
- [ ] 실경로: 포인터 이벤트 → `moveWallStrokes` → Dexie

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/components/workspace/Canvas.tsx` | 84행 `marquee`, 737행 렌더 |
| `web/src/components/workspace/WallStrokeLayer.tsx` | n4 산출물 |
| `web/src/state/workspace.ts` | n1 `moveWallStrokes` |

## 구현 메모
- 넘겨받은 사실 (2026-10-12, n2): `moveWallStrokes`(옮기기)는 되돌리기 기록 항목 형식에 없다. ⌘Z로 옮기기를 되돌릴지 spec이 정하지 않았다 — 되돌린다고 보고(다른 편집과 같은 줄) 항목 종류를 더한다. 틀리면 그 항목만 빼면 된다.

### 2026-10-12 n6 구현 메모 (runner)

**만든 것**
- `components/workspace/wallStrokeHit.ts` — 닿음 판정. 획 경계 상자(굵기 절반 포함)로 거른 뒤 점·선분(Liang–Barsky)으로 확인한다. 점이 상자 밖이어도 선분이 가로지르면 잡힌다. 점 하나짜리(탭)는 그 점이 안이면 잡힌다.
- `state/workspace.ts` — `selectedWallStrokeIds` + `selectWallStrokes(ids)`. 카드 선택(`selectedIds`)과 별개 묶음이다. `holdMarker`/`holdCloth`가 묶음을 비운다(불가능한 조합: 든 채 골라짐), 든 채 호출해도 비운다. 보드를 바꾸거나 불러올 때도 비운다. 없는 id·중복은 거른다.
- `Canvas.tsx` — 기존 `marquee`의 `onUp`이 카드를 고른 뒤 상자를 보드 좌표로 바꿔 벽 획을 같이 고른다(카드 동작은 그대로). shift 등으로 더하면 이전 묶음에 합친다. 빈 벽 한 번 누르기(문턱 이하)는 카드 선택과 묶음을 함께 푼다. Esc: 옮기는 중이면 취소(`cancelMove`), 아니고 묶음이 있으면 묶음을 푼다 — 부모 캔버스로 올라가지 않는다.
- `WallStrokeLayer.tsx` — 묶음 테두리 `<rect data-wall-selection>`(점선, 굵기 1px 고정). 레이어는 포인터를 안 받지만 이 상자만 `pointer-events: all`이라 상자 안을 잡고 끌면 옮긴다. 끄는 동안은 폴리라인에 `transform=translate`만 주고 저장값은 건드리지 않는다. 놓으면 `moveWallStrokes`를 한 번 부른다. 화면 3px 문턱 미만 이동은 저장하지 않는다. 포인터 캡처는 `setPointerCapture?.`로 건다(jsdom 호환).
- 지운 쪽이 이긴다: 끄는 사이 지워진 획은 묶음과 옮기기에서 빠진다(스토어 `moveWallStrokes`가 이미 있는 획만 쓴다). 옮기던 중 마카·천을 집어 묶음이 풀리면 옮기기는 없던 일이다.

**결정·가정 (호출자가 정할 것)**
- **옮기기 ⌘Z는 만들지 않았다.** 브리프 「확정된 결정」이 "이 노드는 만들지 않는다"라서 그대로 따랐다. n2의 넘겨받은 사실은 "되돌린다고 보고 항목 종류를 더한다"였지만 둘이 어긋나 브리프를 우선했다. 결과: 옮긴 뒤 ⌘Z는 그 이전의 마카 기록(획·닦기)을 되돌린다. 옮긴 획의 새 획 기록을 되돌리면 옮긴 자리의 획이 지워지고, 닦기 기록을 되돌리면 원본이 옛 좌표에 되살아난다 — 크래시는 없지만 눈에 거슬릴 수 있다. 넣으려면 `MarkerHistoryEntry`에 `{kind:"move", ids, dx, dy}`를 더하고 `applyMarkerEntry`에서 반대 부호로 `moveWallStrokes`, 레이어 `onSelectionPointerUp`에서 `recordMarkerEdit` 한 줄이면 된다.
- 묶음 상자 안을 눌러 끌기만 옮긴다. 상자 안에 포스트잇·사진·함이 있으면 그 카드(z 10)가 위라 카드가 받는다. 메모판(z auto)은 레이어 아래라 상자가 받는다 — 판 위에 쓴 획을 고르면 판이 아니라 획이 움직인다.
- 펜은 묶음 안에서도 옮기지 않고 쓴다(D5). 휴대폰 크기에서는 옮기지 않는다(고른 획 보기만).
- 고르기 상자는 카드도 같이 잡는다(spec 그대로). 카드와 벽 획이 둘 다 골라져도 카드 끌기는 카드만 옮긴다 — 한 상자로 함께 옮기기는 marker-meets-sticky 몫이다.
- 옮긴 점은 `x + dx`를 반올림하지 않는다(`dx·dy`는 0.1 단위). 저장된 좌표에 `100.30000000000001` 같은 부동소수 잡음이 낄 수 있다 — 필요하면 n1 `moveWallStrokes`에서 소수 첫째 자리로 맞춘다.

**갭**
- 브라우저를 열지 않았다(jsdom 합성 포인터·마우스까지). n7에서 눈으로: 묶음 상자 모양·점선, `cursor: move`, SVG `<rect>`의 포인터 캡처(창 밖에서 놓았을 때), 메모판·사진 위에서 묶음 잡기, 실제 손가락 끌기.
- 터치로는 고르기 상자를 못 만든다 — 기존 `marquee`가 mouse 이벤트라 터치 끌기는 브라우저 팬이 가져간다(이 노드 전에도 그랬다). 마우스로 고른 묶음을 터치로 옮기는 것만 된다.
- 키보드로 옮기기·지우기는 없다(비목표: 지우기는 천).

**게이트** (web/, 2026-10-12): `tsc --noEmit` 0 · 바꾼 파일 eslint 0 · `check-i18n.mjs` exit 0(새 문구 없음) · `vitest run` 207 파일 1891 통과·7 skip — 첫 실행에서 1건이 실패했으나(파일은 못 가렸다) 같은 코드로 두 번 다시 돌려 둘 다 전부 통과, 상존 플래키로 본다. unhandled `DatabaseClosedError`는 `mossBridge`·`workspace.test` 테어다운이다. 새 테스트 26개: `wallStrokeHit.test.ts` 8개(점·선분·굵기·탭·빈 획·묶음 테두리), `WallStrokeSelect.test.tsx` 18개 — 상자로 두 획만 묶임(T17) · 끄는 동안 상자·선분 가로지름 · 빈 벽 누르기로 풀림 · 안 닿는 상자 · 마카·천 집으면 풀림 · 든 채 끌기는 획 · shift 합치기 · 미리보기→한 번 저장·같은 dx·dy·모양 유지(T18) · 포인터→스토어→Y.Doc→Dexie→새로고침 · 줌 2배 · 문턱 미만 · 도중 삭제 · 펜 · 휴대폰 · Esc 제자리(T19) · 옮기는 중 아닐 때 Esc · 옮기는 중 마카 집기. 변이 확인: Esc 취소·문턱을 꺼 보면 각각 해당 테스트가 실패한다.
