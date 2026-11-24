# T9 추가 측정 — event.timeStamp 와 핸들러 시각(performance.now) (KS-6, 2026-10-12)

**범위**: Chrome만, CDP 합성 입력. **Safari는 못 쟀다** — macOS 화면이 잠겨 있어(00:23~, `CGSSessionScreenIsLocked=Yes`) 실입력기 키가 앱에 들어가지 않는다.
CDP 합성이라 실제 한글 입력기가 아니다: `Input.imeSetComposition` → `beforeinput(insertCompositionText)`, `Input.insertText` → `compositionend`, `dispatchKeyEvent`(keyCode 229, 13).
측정기는 문서 capture 리스너라 앱 핸들러보다 먼저 돈다. 원본: `t9-chrome-timestamp-runs.json`, 재현: `t9-chrome-timestamp-measure.py`.

## 1. 메인 스레드가 한가할 때 (300장 벽 포함)
`d = now − ts` 가 모든 이벤트에서 0.0–0.7ms. 두 척도는 같다고 봐도 된다.
`compositionend.ts` 와 확정 뒤 `keydown Enter(13).ts` 의 차이 12–17ms.

## 2. 메인 스레드를 BUSY ms 막고, 그동안 확정 글자·Enter를 큐에 쌓았을 때 (300장 벽, 이직 3줄 이상 매칭)
| BUSY | Enter keydown의 d(now−ts) | compositionend.ts ↔ Enter.ts 차이 | 가드(100ms) | 검색 창 |
|---|---|---|---|---|
| 0 | 0.2 | 16.7 | 막음 | 열려 있음 |
| 60 | 31.5 | 31.5 | 막음 | 열려 있음 |
| 90 | 63.0 | 62.9 | 막음 | 열려 있음 |
| 120 | 89.8 / 97.8(재측정) | 89.7 / 97.8 | 막음 | 열려 있음 |
| 130 | — | 101.6 | **못 막음** | 닫힘(이동) |
| 140 | — | 116.9 | **못 막음** | 닫힘(이동) |
| 150 | 120.6 / 126.3 | 120.6 / 126.3 | **못 막음** | 닫힘(이동) |
| 400 | 372.0 | 371.9 | **못 막음** | 닫힘(이동) |

## 3. 읽는 법
- `keydown`의 timeStamp는 입력이 도착한 시각이고, `compositionend`·`beforeinput`의 timeStamp는 렌더러가 그 이벤트를 **만든 시각**(처리 시각)이다. 막힌 구간만큼 둘이 벌어진다. 위 표에서 `d`와 두 이벤트 차이가 같은 수인 이유다(`compositionend.d ≈ 0`).
- 그래서 `ime.ts`의 `Math.abs(keyStamp − mark.stamp) < 100`은 메인 스레드가 ~130ms 이상 막히면 조합 확정 Enter를 못 거른다. aa08dc7 이전의 핸들러 시각 비교는 이 경우 두 핸들러가 한 묶음으로 돌아 ~1ms 차이였다.
- Safari 경로(`beforeinput(insertReplacementText)` ↔ `keydown Enter`, 가드 50ms)도 `beforeinput`을 렌더러가 만드는 건 같아 보인다. 같은 벌어짐이 50ms부터 생길 수 있다 — **추정이며 Safari에서 재지 못했다.**
- 한가한 300장 벽만으로는 막히지 않았다(1번). 막힘이 실제 벽에서 ≥130ms(Chrome)·≥50ms(Safari 추정)로 Enter와 겹치는지는 이 측정으로 모른다.
