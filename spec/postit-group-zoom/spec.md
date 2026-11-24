# 포스트잇 되돌리기 · 그룹 가시성 · 줌 구간 정책

| 항목 | 값 |
|---|---|
| 문제 | 새 CSS 포스트잇이 예전 종이보다 덜 고급스럽고, 판이 배경에 묻히며, 줄이면 모든 글씨가 같이 작아져 읽을 수 없다 |
| 상위 | spec/frame-image-template/spec.md |
| 상위문제 | 메모를 판에 붙여 한눈에 본다 |
| 상태 | 진행 |
| 시작 | 2026-10-18 |
| ID 머리 | PZ |

## 문제
- 메모 앞면이 e37d124(FT-7)에서 CSS 진한 노랑 면으로 바뀌어, 예전 종이 사진보다 싸 보인다.
- 판 선 `#dadbde` 1px이 배경 `#ebecee`와 대비 약 1.1:1이다. 이름표 12px 회색은 줌과 같이 작아진다(50%에서 선 0.5px, 글씨 6px).
- 줌은 world 레이어의 CSS `scale()` 하나뿐이다. 범위 0.5~1.1, 줌 구간별 표시(LOD)가 없다.

## 목표
메모는 예전 종이 포스트잇으로 돌아간다. 판은 어느 줌에서나 영역과 이름이 보인다. 줌 구간(가까이·보통·멀리)마다 피그마처럼 표시를 바꿔, 줄여도 판 이름으로 지도처럼 읽힌다.

목업: `mockup/zoom-group-postit-asis-tobe.html`(AS-IS/TO-BE 세 장면).

## 비목표
- 도크 아이콘은 바꾸지 않는다(사용자 지시).
- 메모 기울기·"착" 모션·판 소속 규칙은 그대로다.
- 사진·링크·할 일 카드의 LOD는 이번에 다루지 않는다.

## 성공 기준
rows/T1~T5. 결정 rows/D1~D4는 모두 되돌리기 쉬워 추천값으로 확정했다.

## 기술 결정
- 줌 구간은 world 레이어의 `data-zoom-tier`와 CSS 변수 `--zoom-inv`(=1/배율)로 내린다. 카드는 줌 때문에 다시 렌더하지 않는다. 화면 고정 요소는 `--zoom-inv`를 곱한다.
- 구간 규칙은 `globals.css`의 `[data-zoom-tier]` 선택자에 모은다.

## 공통 완료 기준
1. `cd web && npx tsc --noEmit`과 브리프의 vitest 통과. 기준선 실패는 따로 적는다
2. 새 로직 최소 1테스트, 커밋은 `feat(moss):`/`fix(moss):`, 내 파일만 경로로 add, push 금지
3. 실경로 검증(green≠done): 헤드리스 캡처는 사람 눈 확인이 아니다
4. 머지·배포는 사람이 한다

## DAG

```
n1-postit-revert ───────────────┐
n2-zoom-tier ──┬─> n3-group-visible ─┤
               └─> n4-memo-lod ──────┴─> n5-finish
```

edge 사유:
- n2 → n3, n2 → n4: 둘 다 n2의 `data-zoom-tier`·`--zoom-inv`를 읽는다.
- n1 → n4: 둘 다 `cards/text/Content.tsx`를 고친다(n4는 n1이 되돌린 종이 위에 줄 표시를 단다). 그래서 n4는 n1 뒤.
- n1·n3·n4 → n5: 마감 캡처는 모두 끝난 빌드에서 찍는다.

커버리지: 메모 모양 → n1, 줌 전달 → n2, 판 → n3, 메모 LOD → n4, 확인 → n5.

## 노드 인덱스

| ID | 브리프 | deps | 상태 |
|---|---|---|---|
| n1 | [n1-postit-revert.md](n1-postit-revert.md) | — | 끝남 |
| n2 | [n2-zoom-tier.md](n2-zoom-tier.md) | — | 끝남 |
| n3 | [n3-group-visible.md](n3-group-visible.md) | n2 | 끝남 |
| n4 | [n4-memo-lod.md](n4-memo-lod.md) | n1, n2 | 끝남 |
| n5 | [n5-finish.md](n5-finish.md) | n1, n3, n4 | 확인 대기 |

## 파킹 / 보류 로그

