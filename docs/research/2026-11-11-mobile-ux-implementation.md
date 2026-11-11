# 모바일 편집 개선 구현·검증

2026-11-11. 승인된 [AS-IS / TO-BE](../../analysis/asis-tobe/2026-11-11-moss-mobile/README.md)를 로컬 변경본에 구현했다. 운영 서버에는 배포하지 않았다. 기준 HEAD는 `e351374604cf06c818d9dd0328e2c9a69ad9f169`이며, 검증한 미커밋 소스 17개 파일은 [SHA256 명세](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/source-sha256.json)로 식별한다.

## 완료 조건과 판정

| 조건 | 단위·회귀 검사 | Android 통합 확인 |
|---|---|---|
| 기존 할 일의 제목·항목을 터치로 수정 | PASS — 명시적 편집 진입, 실제 Milkdown 입력 | PASS — 제목·첫 항목 수정 후 완료·재열기·새로고침으로 내용 확인 |
| 편집과 이동을 구분하고 축소해도 조작 가능 | PASS — 터치 이동·0.5배 축소·undo | PASS — 71%에서 편집·이동 각각 88×44 CSS px, 이동 손잡이를 즉시 끌어 선택 카드만 이동 |
| 새 메모는 전용 편집 화면에서 작성, 완료 버튼은 키보드 위 | PASS — Dock 생성 및 완료 | PASS — 제목·본문 입력, 완료 후 보드 복귀. 세로 화면 버튼 높이 44px |
| 기존 상세는 읽기로 열리고 키보드가 자동으로 뜨지 않음 | PASS — 제목·본문 읽기 전용, 명시적 편집 | PASS — 입력 필드 없음, 본문 contenteditable=false, 키보드 숨김 |
| 뒤로가기는 키보드 → 상세 → 보드 순서 | PASS — history·Forward·중복 닫기·재열기·Next 상태 보존 | PASS — 세로/가로 모두 첫 Back은 키보드만 닫고 두 번째 Back은 같은 페이지의 보드로 복귀 |
| 마지막 입력이 닫기·회전·보드 전환에 남음 | PASS — 실제 에디터의 저장 대기 중 입력, unmount·resize·Done·보드 로딩 지연 | PASS — 삼성 한글 IME 조합 직후 완료, 회전 시 같은 DOM 에디터, 재열기·새로고침으로 내용 확인 |
| 가로 화면의 키보드가 본문을 가리지 않음 | 실제 레이아웃은 jsdom 판정 제외 | PASS — visual viewport 110.57px에서 본문 스크롤 영역과 오른쪽 완료 버튼이 함께 보임 |
| 보드 로딩 실패 뒤 원래 편집 상태 유지·재시도 | PASS — 실패 주입 후 원래 메모 추가 편집, 재시도 및 저장 내용 확인 | UNVERIFIED — 실기기 IndexedDB 실패 주입은 하지 않음 |
| 실제 라우터의 보드 전환·표 복귀 | PASS — history/라우트/표 회귀 검사 | PASS — 상세 A → 보드 B → Android Back → A, 표의 메모 B → 직접 C, 표 메모 닫기 → 원래 A |
| 기존 손글씨 좌표·데스크톱 동작 유지 | 기존 레이아웃·undo 관련 자동 검사로 확인 | UNVERIFIED — 이번 실기기 검증은 Android 텍스트·할 일에 한정 |

## 구현

- 선택한 카드에 화면 배율과 독립적인 편집·이동 버튼을 표시한다. 이동 버튼을 끌면 기존 카드 드래그·undo 경로를 사용한다.
- 모바일 새 메모는 제목·본문·완료가 있는 상세 편집기로 바로 연다. 기존 메모는 읽기로 열고 편집 버튼으로 전환한다. 제목과 펜 입력도 읽기 상태를 따른다.
- 키보드 높이에 맞춰 상세 높이를 조정한다. 남은 화면이 260px 미만이면 완료 버튼을 오른쪽으로 옮기고 보조 도구를 접는다.
- 모바일 상세에는 같은 URL의 history 항목을 하나만 둔다. Next 상태를 보존하며 닫기·즉시 재열기·보드 탐색을 순서대로 처리한다. Forward는 읽기로 복원한다. 키보드용 history 항목은 만들지 않는다.
- 편집 모드는 상세를 열 때 결정해 회전에 따라 에디터가 재생성되지 않게 했다. 닫기·편집기 제거 전에는 대기 중인 본문을 저장한다. 보드 전환은 대상 문서 로딩을 기다린 뒤 원래 문서에 마지막 입력을 저장하고 편집기를 닫은 후 활성 문서를 바꾼다. 대상 로딩이 실패하면 실패한 캐시 핸들을 제거하고 오류를 전달해, 원래 편집 상태를 유지하면서 재시도할 수 있게 했다.

## 실제 화면

모두 로컬 변경본을 연결된 **Samsung SM-N986N / Android 13 / Chrome 157 / 삼성 키보드**에서 실행한 캡처다. 시안이 아니다.

| 장면 | 실제 화면 |
|---|---|
| 기존 할 일 선택, 편집·이동 | [화면](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/45-final-controls.png) |
| 새 메모 입력과 완료 | [화면](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/07-new-memo-typed.png) |
| 한글 키보드가 열린 편집 | [화면](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/19-korean-ready.png) |
| 읽기 전용 상세 | [화면](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/44-final-read.png) |
| 가로 키보드에서 본문·완료 | [화면](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/36-landscape-keyboard-fixed.png) |

본문의 한글 `한글`은 마지막 composition input 뒤 약 22ms에 compositionend가 발생한 뒤 완료됐다. 제목은 테스트 입력 `한굴`을 포함해 보존됐다. [원시 IME 이벤트](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/22-korean-body-events.json), [완료 후 카드 내용](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/22-korean-body-done.json), [새로고침 후 내용](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/39-persisted.json)을 보관했다.

## 자동 검사와 리뷰

리뷰에서 찾은 화면 크기 변경·unmount·직접 보드 전환의 입력 유실을 실제 Milkdown으로 재현했다. 최초 회귀 테스트 3개가 실패했고 수정 뒤 통과했다. jsdom에 없는 Range 측정 메서드는 테스트에서만 보완했다. 별도로 보드 로딩 중 추가 입력 유실 1건을 RED로 확인한 뒤 수정했고, 관련 36개 검사가 통과했다. 즉시 닫기→다른 카드 재열기에서도 원래 입력과 새 카드 본문이 보존되는 회귀 검사를 추가했다.

검사 로그: [입력 유실 RED](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/moss-mobile-pending-red.log), [수정 후 GREEN](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/moss-mobile-pending-green.log), [로딩 중 입력 RED](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/moss-mobile-board-load-red.log), [수정 후 36개 GREEN](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/moss-mobile-board-load-green.log).

최종 재리뷰에서 보드 로딩 실패 핸들이 캐시에 남아 재시도를 막는 오류를 발견했다. [RED](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/moss-mobile-retry-red.log)로 재현한 뒤 실패 핸들을 제거하도록 수정했고, [관련 40개 검사](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/moss-mobile-retry-green.log)가 통과했다. 리뷰어도 수정 전 실패와 수정 후 성공을 독립적으로 확인했다.

최종 소스 17개 SHA256이 로컬과 원격 검증 worktree에서 모두 일치했다. 아래 검사는 이 최종 변경본에서 새로 실행됐다. 원격 검사 환경은 Node 26의 실험적 localStorage가 jsdom과 충돌하지 않도록 `NODE_OPTIONS=--no-experimental-webstorage`를 사용했다.

| 최종 검사 | 결과 |
|---|---|
| `bun run test --maxWorkers=2` | 210개 파일, **1,941개 통과, 실패 0, 기존 skip 8**, exit 0 |
| `MemoPendingEdit.test.tsx` 단독 | 7/7 통과 |
| `tsc --noEmit` | exit 0 |
| lint | 오류 0, 변경하지 않은 파일의 기존 경고 3, exit 0 |
| `check:i18n` | exit 0, 사용하지 않는 키 목록만 출력 |
| `next build` | exit 0 |

기존 skip은 `DraggableCard.frameFeel`, `canvasCapture`, `Dock.test`에 있던 8개이며 추가하거나 변경하지 않았다. 빌드는 localhost API/sync URL과 검증용 Google client ID로 실행했다. 운영 인증 설정을 검증했다는 뜻은 아니다.

검사 원문은 dongpark 호스트의 `/tmp/moss-mobile-retry-final-{focused,test,tsc,lint,i18n,build,red}.log`에 있다. [최종 리뷰](goat-thread://v1/mcp:76ac2cbd-b00e-401e-ad27-ff3ba3fbe1ee)에서 재시도 결함 해소와 전체 검사 통과를 확인했다. 기존의 전환 취소 시 비활성 문서 캐시 정리 문제는 수정 전에도 재현되어 이번 변경 범위에 넣지 않았다.

추가로 실제 Android Chrome에서 `RouteBoardSync`를 연결해 URL·활성 보드·상세 marker·popstate를 기록했다. [상세가 열린 A](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/56-real-detail-open.json)에서 직접 보드 전환을 호출하면 [B의 URL·활성 문서](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/57-real-direct-b.json)가 일치하고 상세 marker가 없어졌다. Android Back은 [A로 복귀](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/58-real-back-a.json)했다. 표 맥락의 메모 B에서 직접 C로 전환해도 [C에 유지](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/61-table-settled.json)됐고, 표 메모를 닫으면 [원래 A로 복원](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/63-table-close-return.json)됐다. 초기화용 harness와 실제 store 액션을 사용했으며 라우터/history 구현은 대체하지 않았다.

## 범위와 정리

- 실제 기기는 ADB reverse로 `http://localhost:3319/mobile-qa`에 접속했다. 실제 Canvas·Dock·MemoExpandDialog와 로컬 저장소를 사용한 임시 테스트 화면이다. 추가 라우팅 검사는 실제 `/b/<id>` URL과 RouteBoardSync를 사용했다. 운영 로그인·서버 동기화를 포함한 운영 전체 흐름을 검증한 것은 아니다.
- 테스트용 localhost 탭만 닫았다. 임시 Next 서버, ADB reverse/forward와 기기에 만든 XML을 정리했다. 화면 회전은 원래 free 모드로, 키보드는 영문으로 돌렸다. 운영 서비스·인증 설정은 변경하지 않았다.
- 테스트용 route는 소스에서 제거했다. 재현용 [harness 사본](../../analysis/asis-tobe/2026-11-11-moss-mobile/verification/mobile-qa.tsx.txt)은 증거 폴더에만 남겼다. dev bootstrap이 끝난 뒤 준비하도록 기다리며, 로그인을 생략한 테스트 화면이므로 운영에 넣지 않는다.
- NOT RUN: iOS Safari, Gboard IME, TalkBack, 실제 손글씨 회귀, 운영 계정 로그인·기기 간 동기화, CI, 배포. Google OAuth 401 원인 확정은 이번 구현의 결과가 아니다.
