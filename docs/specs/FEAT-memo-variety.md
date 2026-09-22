# FEAT-memo-variety · 메모마다 조금씩 다른 생김새

> 캔버스 위 메모가 저마다 조금씩 기울고 노랑 색조가 달라서, 진짜 포스트잇 묶음을 붙여 둔 것처럼 보인다.

**Status**: 구현 완료 · 리뷰 APPROVE
**Estimated**: S
**시안**: `~/docs/1-life/canvas/moss 메모 생김새 시안.canvas`의 A안. 색만 파스텔 6색 대신 노랑 계열이다.

---

## 1. 목표

캔버스에 메모가 여러 장 있어도 모두 같은 복사본처럼 보이지 않게 한다. 재미 요소다. 종이 질감은 그대로 둔다.

## 2. 범위

### 포함
- `kind === "text"` 메모 앞면을 캔버스 위에서 기울인다. 각도는 ±`tokens.card.rotation`도 안이다.
- 같은 앞면에 노랑 계열 6단계 중 하나로 색조를 얹는다.
- 각도와 색은 메모 id를 해시해 계산한다. 같은 id면 새로고침해도, 다른 기기에서도 같다.
- 메모를 집어 들면 원래 각도에서 -1.5도를 더 기운다. 흡수와 내보내기 애니메이션의 첫 프레임도 같다.
- 펜 모드가 켜져 있으면 모든 메모가 0도로 선다. 색조는 그대로다.

### 제외
- DB 쓰기. `rotation`·`color` 칸에 값을 넣지 않는다. 만드는 곳 6군데도 건드리지 않는다.
- 사용자가 색을 고르는 기능. 나중에 `color`에 값이 있으면 그 값을 먼저 쓰게 한다.
- 내보내기 JSON Canvas의 색.
- 메모판, 댓글 등 다른 kind. 메모 창. 독 끌기 미리보기.
- 소품과 종이 모양 변형. 시안 B·C안이다.

## 3. 수용 기준

### AC-1 — 메모마다 다르다
- **Given** 캔버스에 메모 6장이 있다.
- **Then** 각 메모의 각도는 -1.5도 이상 1.5도 이하다.
- **And** 각 메모의 색조는 팔레트 6색 중 하나다.
- **And** 같은 id는 몇 번을 계산해도 같은 각도와 색이 나온다.
- **And** 무작위 id 1000개를 넣으면 6색이 모두 나오고, 어느 색도 25%를 넘지 않는다.

### AC-2 — 종이 질감이 산다
- **Then** 앞면 배경은 여전히 `/cards/v2/text.png`다.
- **And** 색조는 multiply로 겹쳐 종이 결이 비친다. 종이 바깥 투명한 부분에는 색이 칠해지지 않는다.
- **And** 색조 층은 클릭을 가로채지 않고, 글자보다 아래에 있다.

### AC-3 — 집어 들어도 튀지 않는다
- **Given** 각도가 0.8도인 메모다.
- **When** 메모를 집어 든다.
- **Then** transform이 `scale(1.03) rotate(-0.7deg)`가 된다.
- **When** 손을 뗀다.
- **Then** 0.8도로 돌아간다.

### AC-4 — 펜 좌표가 어긋나지 않는다
- **Given** 펜 모드를 켠다.
- **Then** 모든 메모의 각도가 0이다.
- **And** 펜 모드를 끄면 원래 각도로 돌아간다.

### AC-5 — 다른 카드는 그대로다
- **Then** 메모판(frame)과 그 밖의 kind는 transform과 색이 지금과 같다.

## 4. 비기능

- 메모 200장 캔버스의 첫 그림 시간이 지금보다 10% 넘게 느려지지 않는다. `FEAT-sticky-redesign` §8과 같은 기준이다. 재지 못하면 "미증명"으로 남긴다.

## 5. 구현 메모

- 앞면 배경: `web/src/components/workspace/cards/text/Content.tsx:110`의 루트 div가 `url("/cards/v2/text.png") 0 0 / 100% 100%`를 칠한다. 색조 층은 이 안에 `mask`를 같은 png로 준 absolute div로 넣는 방식을 시안에서 확인했다. 시안 CSS: `~/docs/1-life/canvas/moss-memo-variety/mock.html`의 `.tint`.
- 들어올림 transform: `web/src/components/workspace/DraggableCard.tsx:451`의 `lifted ? "scale(1.03) rotate(-1.5deg)" : undefined`. 흡수 애니메이션 첫 프레임 `:254`, 내보내기 `:301`도 같은 문자열이다. 기울기는 이 컨테이너 transform에 합친다. 선택 outline도 함께 기운다.
- 각도 상한: `web/src/design/tokens.ts:120` `card.rotation: 1.5`. 지금까지 아무도 안 쓰던 값이다.
- `rotation` 칸은 모든 생성 경로가 0을 넣고, 그리는 코드는 없다. `color` 칸은 쓰는 코드가 0곳이다. 둘 다 이번에 건드리지 않는다.
- 펜 좌표: `web/src/components/workspace/cards/_shared/useDrawing.ts:82` `toLocal`이 SVG의 `getBoundingClientRect` 기준으로 뺀다. 1.5도 기울면 220px 메모에서 약 6px 어긋난다. 그래서 AC-4로 펜 모드에서 0도로 세운다. 펜 모드 상태는 `Content.tsx:75` 근처에서 읽는 보드 전역 값이다.
- 레포에 문자열 해시 헬퍼는 없다. 새로 작게 만든다.
- 팔레트 6색은 구현자가 정한다. 노랑 계열 안에서 레몬, 버터, 크림, 살구빛 노랑처럼 가깝게 고른다.
- 9/13에 앞면을 CSS 그라디언트로 바꿨다가 종이 질감이 사라져 되돌렸다. 배경 이미지를 대체하지 말고 위에 얹는다.
- 뒤집힌 결정: 색조 층 아래 깔기를 처음엔 `MemoTitleRow`에 `position:relative`를 줘서 풀었다. 리뷰에서 "뒤에 오는 형제는 모두 positioned여야 한다"는 숨은 계약이 생긴다는 지적을 받았다. 그래서 색조 층 `z-index:-1`과 루트 `isolation:isolate`로 바꿨다.
- 메모에 transform이 늘 붙으면 안쪽 `position:fixed` 요소는 카드 기준이 되고 `overflow:hidden`에 잘린다. 그래서 버블 툴바 `BubbleMenuHost`를 body로 portal했다. portal된 툴바는 `data-bubble-toolbar`로 표시하고, `isFocusInSameCard`가 이를 같은 카드로 인정한다.
- 남은 한계: 툴바가 body 끝으로 옮겨져 편집기에서 Tab으로 바로 닿지 않는다. 서식은 Milkdown 단축키로 쓸 수 있다.
