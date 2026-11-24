# PR #27 main 통합

대상: `c8b7347` + `origin/main b24ff41` (PR #26 모바일 메모 편집·이동 개선). 기존 관리 작업 트리에서 merge commit으로 통합하며 force push·운영 배포는 하지 않는다.

충돌 표면은 `web/src/components/workspace/Dock.tsx`의 콜백 의존성, `__tests__/Canvas.touch.test.tsx`의 양쪽 회귀 추가, `cards/MemoExpandDialog.tsx`의 viewport hook과 새 메모 read/edit/history 처리다. 양쪽 테스트를 유지하고 viewport 추적은 기존 공유 hook을 사용한다. main의 신규 메모 즉시 편집·수동 이동·본문 flush·보드 전환·뒤로가기를 보존한다.

자동 병합된 Canvas가 main의 MobileCardActions를 추가한다. 링크의 일반 편집 버튼이 별도 URL 완료/취소 정책을 우회하지 않게 하고, 연결·크기·주소 편집 중 이동 도구를 숨긴다. compact 메모 편집은 main의 명시적 edit 모드를 사용하고 중복 편집 버튼은 제공하지 않는다. 넓은 터치 화면의 기존 하단 진입은 유지한다.

완료 조건: 링크 주소 경로1개, 연결/resize 중 이동 도구 없음, 메모 편집 버튼1개·expandedCardMode=edit, 기존 이동과 undo 유지, 양쪽 history/flush/터치 회귀 통과. 병합 후 전체 test·typecheck·lint·i18n·build와 독립 검토. 명령은 `bun run --cwd web test` + MobileCardControls/Canvas.touch/MemoMobileFlow/MemoPendingEdit/memoHistory/Dock 관련 파일, 전체는 원격의 기존 Node26 webstorage 분리 옵션 사용. 실제 클라이언트에서 링크·메모 편집과 선택 도구를 확인한다.

로컬 회귀: 신규 통합 테스트는 병합 직후4개 실패(일반 링크 편집/조작 중 이동/중복 메모 편집), 수정 후 관련6개 suite86 passed /기존2 skipped. Typecheck는 삭제한 소유 QA route의 생성 타입을 정리한 뒤 exit0. 최종 전체 gate·독립 검토·실제 클라이언트 통합 확인은 진행 중이다.


최종 코드: 병합 `2761bc4` + 첫 렌더 보완 `281ae7e`. web tree `7f317ec11c8391b8115fcefbac0ea17e55297ff1`가 독립 검증 결과와 일치한다. Dock의 compact 값을 새 선택 도구에 전달해 초기 effect 이전의 중복 Edit도 제거했다. 실제 Ego에서 중복2개→1개를 확인했고, 독립 React Profiler probe도 이전 committed counts [2,1]을 재현한 뒤 같은 단언으로 통과했다.

최종 독립 리뷰: APPROVE, 미해결 P0/P1/P2 0개. 원격 관리 작업 트리의 `NODE_OPTIONS=--no-experimental-webstorage bun run test`는219 files /2002 passed /기존8 skipped /실패0. 집중14개 파일125 passed /기존 Dock2 skipped, 독립 probe7 passed. Typecheck·전체/변경 ESLint·i18n·webpack build·PR 기준 diff 검사는 모두 exit0. 기존 lint 경고3개·unused key75개·Node/Vite 경고는 유지했다. 최초 merge index 체크의 main green.log3개 EOF 안내는 main에서 그대로 온 기록이며 수정하지 않았다. 최종 PR 기준 diff는 깨끗하다.

Ego TaskSpace28, 로컬 임시 QA 화면에서 신규 메모 즉시 편집, 기존 메모 제목 수정 후 완료 저장, 링크 URL 취소 후 원본 유지, 연결/resize 중 이동·일반 편집 숨김, 탭 연결1개, 폭240→270 및 world 불변을 확인했다. 신규 메모는 기존 카드와 충돌하지 않는 화면 밖 위치에 생성되어, 전체 보기 후 저장된 제목을 확인했다. [구조화된 결과](mobile-canvas-evidence/2026-11-12/pr27-main-integration.json).

검증용 카드4개를 정상 삭제 경로로 정리하고 매칭 잔여0개를 확인했다. 소유 QA 보드도 정리했다. 임시 route와 서버3310을 제거/종료했으며 Ego 공간28도 keep 없이 종료했다. 원래 앱의 seed 카드들은 삭제하지 않았다. 해당 출처는 인증 없는 로컬 테스트 harness이며 운영 인증 통과 주장이 아니다.

NOT RUN: 기본 Node26 전체 명령(기존 webstorage 환경 실패2건), 병합 후 Android/iPhone/실제 펜·두 손가락·실제 협업 재검증. 원래 구현 보고서의 실기기 한계는 유지된다. GitHub CI는 push 후 상태를 별도로 확인한다. 원격 검토 상세 원본은 로컬 `/tmp/moss-pr27-main-integration/review-final.md`에 보존했다.
