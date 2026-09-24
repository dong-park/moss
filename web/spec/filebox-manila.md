# Spec: 파일함 카드 실사 마닐라 폴더 (FEAT-filebox-manila)
Started: 2026-09-24

## 목표

파일함 카드를 메모지와 같은 "사무용품 실사" 톤의 마닐라 폴더로 그린다.
폴더 앞판 가운데에 이름이 크게 보이고, 안에 든 카드가 많을수록 종이가 확실히 더 삐져나온다.
독 아이콘과 드래그 미리보기도 같은 폴더를 쓴다.

## 비목표

- 폴더 색을 바꾸는 기능은 만들지 않는다. 모든 파일함은 같은 마닐라 색이다.
- 삐져나온 종이에 안에 든 메모 색을 입히지 않는다. 종이는 크림색 한 가지다.
- 카드 앞판에서 이름을 바로 고치는 편집은 이번에 하지 않는다. 이름은 지금처럼 파일함 안의 보드 선택기에서 고친다.
- 다크 모드용 폴더는 만들지 않는다. 앱에 다크 모드가 아직 없다.
- 개수를 정확한 장수만큼 종이로 그리지 않는다. 종이는 몇 단계로만 나눈다.
- 폴더 비율에 맞춰 카드 비율을 바꾸지 않는다. 카드 박스는 정사각형 그대로다.

## 이미 된 것

- 실사 사진에서 잘라낸 레이어 에셋이 있다. 뒤판, 앞판, 종이 2단계, 닫힌 폴더 한 장이다.
- 카드는 뒤판, 종이, 앞판 순서로 겹쳐 그린다.
- 드롭 대상이면 앞판이 살짝 내려가 벌어진다. 라임 링은 없다.
- 파일함 카드는 ±1도 안에서 기울고, 펜 모드에서는 기울지 않는다.
- 독 아이콘은 같은 폴더로 바뀌었다. 원본 파란 상자는 따로 보존했다.
- 드래그 미리보기는 닫힌 폴더 사진을 쓴다.

## 남은 것

- 이름을 탭 라벨에서 앞판 가운데로 옮긴다. 메모 제목처럼 크게 쓴다.
- 탭 라벨에는 개수("N개")를 쓴다. 앞판 아래 개수 글자는 없앤다. 앞판에는 이름 하나만 남는다.
- 종이가 확실히 보이게 에셋을 다시 만든다. 지금은 4장이 들어도 얇은 선 한 줄뿐이다. 새로 생성하지 않고, 지금 실사 사진의 종이를 더 올리고 장수를 겹쳐 만든다(뒤판·앞판과 픽셀 정렬 유지, scripts/gen-filebox-assets.py에서 재현).
- 종이 단계는 0 / 1~3 / 4+ 그대로 둔다. 0장과 적음과 많음이 한눈에 달라지도록 에셋만 고친다.
- 카드 박스는 정사각형 그대로 둔다. 폴더 위아래 투명 여백은 허용한다(데이터 이전 없음).
- 테스트를 새 배치에 맞게 고친다.

## 성공 기준

- 기본 크기 카드에서 이름이 앞판 가운데에 14px 이상으로 보인다. 화면 배율 100%에서 한글 8자가 말줄임 없이 읽힌다.
- 이름이 비어 있으면 "이름 없는 파일함"이 같은 자리에 흐린 색으로 보인다.
- 0장, 1~3장, 4장 이상 폴더를 나란히 놓으면 세 개가 서로 다르게 보인다.
- 0장 폴더는 종이가 전혀 보이지 않는다.
- 1~3장·4장+ 폴더는 탭 오른쪽 구간에서 종이가 **뒤판 윗선 위로 튀어나온다**. 4장+는 1~3장보다 장수·높이가 눈에 띄게 많다. 종이는 탭 라벨(개수)을 가리지 않는다.
- 종이 색은 메모지 노랑 계열(memoVariety의 MEMO_TINTS)이라 마닐라색과 한눈에 구분된다.
- 판정: 0/1~3/4+를 기본 카드 크기(폭 200px)로 줄여 나란히 놓은 비교 이미지에서 설명 없이 셋이 구분된다.
- 탭 라벨에 개수("N개")가 보이고, 앞판에는 개수 글자가 없다.
- 카드를 파일함 위로 끌면 150ms 안에 앞판이 벌어지고, 벗어나면 되돌아간다.
- 독 아이콘은 40px로 그려져도 폴더로 알아볼 수 있다. 다른 독 아이콘과 여백이 비슷하다.
- 독에서 파일함을 끌 때 미리보기가 닫힌 폴더 사진이다.
- 위 상태를 모두 실화면 캡처로 남긴다. 빈 폴더, 적음, 많음, 드롭 중, 독이다.
- 타입 검사와 i18n 검사가 통과한다. 파일함 관련 테스트가 모두 통과한다.
- 전체 테스트의 실패는 기존에 알려진 2건을 넘지 않는다.

## 경계 조건

- **긴 이름**: 앞판 폭을 넘으면 두 줄까지 쓰고 나머지는 말줄임한다. 원문 전체는 마우스를 올리면 보인다.
- 이름이 공백뿐이면 빈 이름으로 본다.
- 0개: 종이 레이어를 그리지 않는다. 탭 라벨 개수 표시는 "0개"다.
- 아주 많은 개수: 100개 이상이어도 가장 두꺼운 단계에서 멈춘다. 탭 라벨 개수는 숫자 그대로 쓰고, 라벨 폭을 넘으면 "99+"로 줄인다.
- 개수를 아직 모르면 0개로 그린다. 값이 들어오면 바로 다시 그린다.
- 카드 리사이즈: 파일함 카드는 정사각형 비율을 강제한다. 폴더는 가로형이라 박스 안에서 세로 가운데에 놓인다.
- 카드가 아주 작아지면 이름 글자는 최소 10px에서 멈추고 말줄임한다. 탭 라벨 개수는 숨겨도 된다.
- 카드가 아주 커져도 에셋은 640px 원본이다. 800px 폭을 넘으면 흐려질 수 있다.
- 펜 모드: 기울기 0도다. 파일함 위에는 펜으로 그리지 않는다.
- 드롭 대상 상태는 한 번에 한 파일함에만 켜진다.
- 드래그 미리보기는 개수와 상관없이 닫힌 폴더 한 장을 쓴다.
- 이름 글자는 클릭을 가로채지 않는다. 더블클릭하면 지금처럼 파일함 안으로 들어간다.
- 에셋을 못 불러오면 빈 투명 박스가 된다. 이름과 개수 글자는 그래도 보인다.

## 기술 결정

- 사진 레이어를 겹친다. 메모 카드가 종이 사진 png를 배경으로 쓰는 방식과 같다. 톤을 맞추려면 같은 기법이어야 한다.
- 뒤판과 앞판을 따로 둔다. 앞판만 움직여야 드롭 때 벌어지는 느낌이 난다.
- 종이 구분은 높이 %가 아니라 윤곽(뒤판 위로 튀어나옴)과 색(메모 노랑)으로 한다. /hate 실험(spec/filebox-photo/hate-check.png): 뒤판 안쪽에서 12px 더 올려도 크림색 종이는 200px 카드에서 구분되지 않았다(크림/마닐라 밝기 차 ~6%).
- 종이는 단계별 이미지로 둔다. 장수마다 그리면 에셋이 늘고 작은 크기에서 구분도 안 된다.
- 기울기 상한은 메모보다 작게 둔다. 각진 사물이 많이 기울면 어색하다.

## 열린 질문

없음. 2026-09-24 사용자 확정:
1. 탭 라벨 = 개수("N개"), 앞판 아래 개수 글자 제거.
2. 종이 단계 = 0 / 1~3 / 4+ 유지.
3. 카드 박스 = 정사각형 유지, 위아래 여백 허용.
4. 앞판 이름 인라인 편집 = 비목표 유지.
5. 종이 에셋 = 지금 실사 사진의 종이를 늘려 만든다(재생성 없음).

## 구현 메모

- 브랜치 feat/filebox-manila(main 531612d 기반). 이전 에이전트들의 미커밋 구현이 작업 트리에 있다 — 이것을 이어받아 원자 커밋으로 정리한다. spec/filebox-photo의 원본 레이어(folder-*.png, make-layers.py)는 재생성 스크립트 입력이라 커밋한다. codex.log 같은 로그와 spec/*-brief.md는 커밋하지 않는다.
- 이전 claude 어댑터 에이전트 2회가 프로바이더 응답 타임아웃(300s)으로 죽었다 — 도구 호출·출력을 작게 나눈다.
- 기존 결함(HEAD에서도 동일, 범위 밖): Canvas.virtualization.test.tsx 실패, ExportModal.tsx eslint 오류 1건.

- 카드: `src/components/workspace/cards/board/Content.tsx`. 레이어 박스는 aspectRatio 640/514, 세로 가운데.
- 현재 이름 위치는 left 8%, top 4.5%, width 25%, 9px truncate. 개수는 bottom 12%, 10px.
- 종이 단계 함수 `paperState`: 0 → 없음, 1~3 → low, 4+ → high.
- 드롭 상태는 `dropTargetFunnelId === card.id`. 앞판 transform translateY(2.5%), 150ms.
- 이름은 `boards[].name`을 trim. 빈 값이면 i18n `cards.board.unnamed`. 개수는 `subcanvasCounts[boardRef]`. 탭 라벨용 짧은 개수 문구("{count}개")는 새 i18n 키로 추가한다(기존 `cards.board.count`="카드 {count}개"는 다른 곳에서 쓰는지 grep 후 유지/정리).
- 이름 변경 경로는 `BoardPicker.tsx` 인플레이스 편집과 `renameBoard` 하나뿐이다. 카드에서 여는 경로는 없다.
- 기울기: `memoVariety.ts`의 `cardRotationDeg(id, kind)`. board 상한 `BOARD_ROTATION_MAX_DEG` = 1. `DraggableCard.tsx`에서 penMode면 0.
- 비율: `workspace.ts`의 `CARD_ASPECT_BY_KIND.board = 1`. `ResizeHandles.tsx`가 `aspectForKind`로 비율을 강제한다. 기본 폭 `widthForKind("board")` = 200.
- 드래그 미리보기: `DockDragPreview.tsx`가 `/cards/v2/board.png`를 쓴다.
- 에셋: `public/cards/v2/board*.png` 640px. 독 `public/icons/dock/filebox.png`, 원본 `public/icons/dock/orig/filebox.png`.
- 재생성: `scripts/gen-filebox-assets.py`. 원본 생성물과 레이어 분리 스크립트는 `spec/filebox-photo/`.
- 레이어는 back+front=empty 픽셀 정렬. 앞판에 가려졌던 뒤판 부분은 종이 질감으로 복원했다. 앞판을 크게 벌리면 티가 난다.
- 실화면 캡처: `spec/filebox-photo/impl-empty.png`, `impl-multiple.png`, `impl-drop-open.png`, `impl-dock.png`.
- 다크 모드: `src`에서 prefers-color-scheme, data-theme, .dark 흔적이 없다.
- 테스트: `memoVariety.test.ts`, `CardContent.board.test.tsx`. 파일함 관련 15/15 통과.
- 전체 vitest 904 pass, 2 fail, 3 skip. `Canvas.virtualization.test.tsx`는 HEAD에서도 실패한다. 브리지 테스트는 단독 재실행에서 통과하는 플래키다.
- eslint 오류 1건 `ExportModal.tsx`는 HEAD에서도 같고 범위 밖이다.
- 구현 브리프는 `spec/filebox-manila-brief.md`, `spec/filebox-apply-brief.md`.
- 뒤집힌 결정: 이름을 탭 라벨판 위에 쓰다가 앞판 가운데로 옮기기로 했다. 9px 탭 글자는 판독할 수 없었다.


## Plan: 파일함 카드 실사 마닐라 폴더 — 마무리

## 사람용 요약

**한 줄로**: 폴더 앞판에 이름을 크게, 탭에는 개수를, 안에 든 종이는 눈에 띄게 — 이미 붙인 실사 폴더를 "읽히는" 폴더로 다듬는다.

1. **종이가 보이게 사진 다듬기** ← 사용자가 본 "4장 들어도 빈 폴더 같다" 해결. 지금 사진의 종이를 더 올리고 겹쳐, 적음·많음 두 장을 다시 만든다.
2. **이름·개수 자리 옮기기** ← 사용자가 본 "탭 이름이 안 읽힌다" 해결. 이름은 앞판 가운데 크게(길면 두 줄), 개수는 탭 라벨로.
3. **확인과 캡처** — 테스트를 새 배치에 맞추고, 빈 폴더·적음·많음·드롭 중·독을 실화면으로 찍어 남긴다.

진행: 1과 2는 서로 독립(병렬 가능) → 3

---

<!-- STEP:0:paper-assets:completed -->
### T-0: 삐져나온 종이 에셋을 눈에 띄게 다시 만든다

#### 읽을 파일
- `scripts/gen-filebox-assets.py` — 실사 원본에서 640px 레이어를 자르는 스크립트
- `spec/filebox-photo/folder-full-1.png`, `folder-back.png`, `folder-front.png`, `folder-empty.png` — 1024² 원본 레이어(픽셀 정렬)
- `spec/filebox-photo/hate-check.png` — 높이만 올린 방식이 실패한 증거
- `src/components/workspace/memoVariety.ts` — MEMO_TINTS(메모 노랑 6단계)
- `public/cards/v2/board-papers-low.png`, `board-papers-high.png` — 교체 대상

#### 작업
스크립트를 고쳐 papers-low(1~3장)·papers-high(4+장)를 재생성한다. 원본 사진 종이의 질감(full−empty 차이)을 바탕으로, 메모 노랑(MEMO_TINTS) 색조를 multiply로 입힌 종이 여러 장을 **탭 오른쪽 구간에서 뒤판 윗선 위로 튀어나오게** 겹친다(장마다 약간 어긋남·회전 ±1.5도 이내, 부드러운 그림자). low 2장 정도, high 5장 정도로 확실히 다르게. 종이가 뒤판 위로 나오므로 캔버스 위쪽 여백이 필요하면 back/front/papers 모두 같은 캔버스로 다시 잘라 정렬을 유지한다(Content.tsx의 aspectRatio도 맞춘다). 탭 라벨 영역은 가리지 않는다. 결과를 0/low/high 나란히 폭 200px로 줄인 spec/filebox-photo/papers-check.png로 저장해 직접 보고, 셋이 설명 없이 구분될 때까지 고친다.

#### AC
```bash
python3 scripts/gen-filebox-assets.py && python3 -c "from PIL import Image; s={Image.open('public/cards/v2/'+f).size for f in ['board-back.png','board-front.png','board-papers-low.png','board-papers-high.png']}; assert len(s)==1, s; print(s)"
```
papers-check.png에서 0/1~3/4+가 설명 없이 구분되고, 종이가 탭 라벨을 가리지 않는다.

#### 금지사항
- 폴더(뒤판·앞판) 이미지를 새로 생성하지 마라. 이유: 사용자 확정(실사 1번), 정렬이 깨진다.
- 종이를 높이만 조금 올리는 방식으로 끝내지 마라. 이유: /hate 실험에서 200px 카드에서 구분되지 않았다.

- summary: 원본 사진 종이 질감을 메모 노랑 색조로 입혀 2장/5장 레이어를 재생성했다. 200px 비교 이미지에서 빈/적음/많음이 구분되고 탭 왼쪽 라벨을 가리지 않는다.
<!-- /STEP -->

<!-- STEP:1:name-count-layout:pending -->
### T-1: 이름은 앞판 가운데, 개수는 탭 라벨로

#### 읽을 파일
- `src/components/workspace/cards/board/Content.tsx` — 파일함 카드(레이어·이름·개수 배치)
- `src/components/workspace/cards/_shared/MemoTitleRow.tsx` — 메모 제목 글꼴·크기 참고
- `src/i18n/messages/ko.json` (및 다른 locale) — `cards.board.*`
- `src/components/workspace/cards/__tests__/CardContent.board.test.tsx`

#### 작업
이름: 앞판 가운데, 기본 크기에서 14px 이상, 최대 두 줄 후 말줄임, 최소 10px, 전체 이름은 title 속성. 빈 이름은 "이름 없는 파일함"을 흐린 색으로. 개수: 탭 흰 라벨 칸 안에 "{count}개"(새 i18n 키, 모든 locale), 폭 넘으면 "99+". 앞판 아래 개수 글자 제거. 글자는 pointer-events 없음(더블클릭 진입 유지). 테스트를 새 배치에 맞게 고친다.

#### AC
```bash
npx vitest run src/components/workspace/cards/__tests__/CardContent.board.test.tsx src/components/workspace/__tests__/memoVariety.test.ts && npx tsc --noEmit && bun scripts/check-i18n.mjs
```

#### 금지사항
- 카드 박스 비율(정사각형)과 리사이즈 규칙을 바꾸지 마라. 이유: 사용자 확정, 기존 카드 데이터 이전이 생긴다.
- 앞판에 이름 편집 입력을 넣지 마라. 이유: 비목표.

- summary:
<!-- /STEP -->

<!-- STEP:2:verify-capture:pending -->
### T-2: 게이트와 실화면 캡처

#### 읽을 파일
- `spec/filebox-manila.md` — 성공 기준 목록
- `spec/filebox-photo/impl-*.png` — 이전 캡처(비교용)

#### 작업
전체 게이트를 돌리고, dev 서버(localhost:3000, 떠 있으면 재사용)에서 메모 옆 파일함 빈 폴더·1~3장·4장+·드롭 중·독을 캡처해 `spec/filebox-photo/impl-*.png`를 갱신한다. 성공 기준마다 통과/실패를 spec 끝에 기록.

#### AC
```bash
npx tsc --noEmit && bun scripts/check-i18n.mjs && npx vitest run 2>&1 | grep -E "Tests "   # 실패는 기존 2건(Canvas.virtualization, 브리지 플래키) 이하
```
캡처 5장이 존재하고, 이름이 한글 8자까지 말줄임 없이 읽힌다.

#### 금지사항
- ExportModal.tsx 린트 오류와 Canvas.virtualization 테스트를 이 작업에서 고치지 마라. 이유: HEAD에서도 동일한 기존 결함, 범위 밖.

- summary:
<!-- /STEP -->
