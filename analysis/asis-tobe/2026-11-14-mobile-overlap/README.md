# 모바일 겹침·잘림 — 부분 구현 기록

요청: 모바일 5장면 겹침/잘림, 본문 가독성, 모바일 조작 보존, 데스크톱 비교.
유형: 화면 비교. 2026-11-14 로컬 작업. 원본 기준: 9cfdacc4a69c584567242dacc8c76a01701efbce.

현재 결과: 공유창 좌측 잘림만 수정·경계 검증. 전체 작업은 미완료(UNVERIFIED).

## 근거

출처: 실제 SharePopover/Canvas/Dock/MemoExpandDialog를 구동한 로컬 fixture. 인증·공유 서버 응답은 검증하지 않음. fixture.tsx.txt는 임시 QA route 원본이며 제품 route로 남기지 않음.
동일 조건: 390×844 CSS viewport, deviceScaleFactor 1, 같은 로컬 보드 및 공유창 props.

| 장면 | 변경 전 | 변경 후 | 번호 |
|---|---|---|---|
| 공유창 | screens/before-share.png | screens/after-share.png | ① |

보드: share-comparison.png. 원본: board/share.html.
브라우저 경계 검사 RED: `{left:-20,right:280}`, viewport 내 검사 false.
GREEN: `{left:8,right:382}`, 양쪽 8px 검사 true.

검증 명령: `cd web && bun run test src/components/share/__tests__/SharePopover.guidance.test.tsx src/components/share/__tests__/ShareControl.test.tsx` — 2 files, 10 tests passed, zero failures.
`cd web && bunx tsc --noEmit` — exit 0.
`cd web && bunx eslint src/components/share/SharePopover.tsx` — exit 0.
`git diff --check` — exit 0.

NOT RUN: 나머지 4장면 수정/회귀 검증, 데스크톱 전후 비교, 전체 시험, 실제 인증 공유 동작, 전체 changed-files check.
도구막대/선택막대/메모/링크 모달 수정은 아직 없음. 공유창의 개인정보 버튼과 겹침 해소도 실제 shell에서 미검증.
