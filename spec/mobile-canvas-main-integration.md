# PR #27 main 통합

대상: `c8b7347` + `origin/main b24ff41` (PR #26 모바일 메모 편집·이동 개선). 기존 관리 작업 트리에서 merge commit으로 통합하며 force push·운영 배포는 하지 않는다.

충돌 표면은 `web/src/components/workspace/Dock.tsx`의 콜백 의존성, `__tests__/Canvas.touch.test.tsx`의 양쪽 회귀 추가, `cards/MemoExpandDialog.tsx`의 viewport hook과 새 메모 read/edit/history 처리다. 양쪽 테스트를 유지하고 viewport 추적은 기존 공유 hook을 사용한다. main의 신규 메모 즉시 편집·수동 이동·본문 flush·보드 전환·뒤로가기를 보존한다.

자동 병합된 Canvas가 main의 MobileCardActions를 추가한다. 링크의 일반 편집 버튼이 별도 URL 완료/취소 정책을 우회하지 않게 하고, 연결·크기·주소 편집 중 이동 도구를 숨긴다. compact 메모 편집은 main의 명시적 edit 모드를 사용하고 중복 편집 버튼은 제공하지 않는다. 넓은 터치 화면의 기존 하단 진입은 유지한다.

완료 조건: 링크 주소 경로1개, 연결/resize 중 이동 도구 없음, 메모 편집 버튼1개·expandedCardMode=edit, 기존 이동과 undo 유지, 양쪽 history/flush/터치 회귀 통과. 병합 후 전체 test·typecheck·lint·i18n·build와 독립 검토. 명령은 `bun run --cwd web test` + MobileCardControls/Canvas.touch/MemoMobileFlow/MemoPendingEdit/memoHistory/Dock 관련 파일, 전체는 원격의 기존 Node26 webstorage 분리 옵션 사용. 실제 클라이언트에서 링크·메모 편집과 선택 도구를 확인한다.

로컬 회귀: 신규 통합 테스트는 병합 직후4개 실패(일반 링크 편집/조작 중 이동/중복 메모 편집), 수정 후 관련6개 suite86 passed /기존2 skipped. Typecheck는 삭제한 소유 QA route의 생성 타입을 정리한 뒤 exit0. 최종 전체 gate·독립 검토·실제 클라이언트 통합 확인은 진행 중이다.
