# n2-hand-font — 손글씨 폰트 Nanum Pen Script 자체 호스팅

> 자기완결 브리프. `spec/glass-wall/glass-surface/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행 메모는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다. `**상태**:` 줄은 손으로 고치지 않는다 — graph-run이 `진행`·`끝남`을 쓰고, 멈추면 `node_state.py block`, 사람 확인이 필요하면 `node_state.py review`만 쓴다.

**agent**: runner
**id**: GS-2
**상위**: spec/glass-wall/glass-surface/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T15

## 문제

시안의 손글씨는 Nanum Pen Script인데, Google Fonts에서 불러오면 공유하지 않은 벽도 외부로 요청을 보낸다.

## 목표

moss가 손글씨 폰트 파일을 직접 싣고, CSS 변수 하나로 어디서나 쓸 수 있다. 외부 폰트 요청은 0건이다.

## 확정된 결정

- 폰트는 Google Fonts에서 불러오지 않는다. 줄기 결정이고 local-promise의 약속과 짝이다.
- 이 노드는 폰트를 쓸 수 있게만 한다. 포스트잇·마카 글씨에 실제로 입히는 일은 sticky-handfeel·wall-marker 몫이다. 이 티켓 안에서는 n4 재질 카드 라벨과 n5 메모판 이름표가 쓴다.

## 작업

1. Nanum Pen Script woff2를 레포에 넣는다. 한글 전체 글리프가 크면 `next/font/local`의 서브셋 대신 파일 하나로 두고 크기를 구현 메모에 적는다. 라이선스는 SIL OFL 1.1 — 라이선스 파일을 폰트 옆에 둔다.
2. `web/src/app/layout.tsx`에서 `next/font/local`로 불러 CSS 변수 `--font-hand`를 낸다. Geist Mono를 싣는 방식을 따른다.
3. `web/src/app/globals.css`의 `@theme inline`에 `--font-hand`를 노출해 `font-hand` 유틸리티로 쓸 수 있게 한다.
4. 테스트: 새 파일 `web/src/app/__tests__/handFont.test.ts` — 소스 트리에 `fonts.googleapis.com`·`fonts.gstatic.com` 문자열이 없고, 폰트 파일이 실재한다.

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- src/app/__tests__/handFont.test.ts` 통과
- [ ] `cd /Users/dongpark/moss && grep -rnE "fonts\.(googleapis|gstatic)\.com" web/src | wc -l` 결과 0
- [ ] `cd web && bunx tsc --noEmit` 통과
- [ ] 실경로: 네트워크 탭 확인은 n6 실브라우저 노드가 한다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/app/layout.tsx` | Geist Mono 자체 호스팅 선례, 폰트 변수 추가 |
| `web/src/app/globals.css` | `@theme inline` 145행 |
| `web/src/app/__tests__/` | 테스트 자리 (실존) |
