# Moss UI/UX 개선 구현·검증 기록

- 작성: 2026-11-13
- 상태: **개선 구현·자동 검증 완료. 아래 실기기·협업 조건은 UNVERIFIED.**
- 범위: [승인된 계획](ui-ux-review-plan.md), 첨부 PDF의 U01~U15. 빈 메모·할 일·링크는 계속 표시하며 카드 종류별 기존 크기 규칙을 유지한다.
- 시작 코드: `36fe2060fc9ee2e40074826d203e4238cc9a3c6d`.
- 검증 대상: [최종 소스 해시 목록](../docs/verification/ux-review-final/final-source.manifest.json), SHA256 `3344437e42bdf3ccfde04620e9046bbc674cad104ada0c91f1bccb2294d37b19`.
- 원격 검사 후 로컬 511개 소스·package/lock 파일을 다시 대조했다. 누락 0, 추가 0, 해시 불일치 0. 최종 문서·화면 자료만 검사 대상 밖의 추가 산출물이다.

## 구현한 동작

- 빈 링크의 내부 표식을 표·검색·펼친 편집창에서 제외한다. 사용자 작성 코드·주석은 보존한다. 빈 메모·할 일·링크는 유형과 입력 안내를 표시하고 남긴다. 파생 표시 제목을 원본 제목에 저장하지 않는다.
- 표에 할 일 진행 개수, 필터 칩·결과 수·초기화·실제 선택 대상 범위를 제공한다. 빠른 표 전환은 대기 중인 미러 저장 후 읽으며, 읽기 실패 재시도와 늦은 응답 취소를 지원한다.
- 텍스트 자동 폭은 480 월드 px에서 줄바꿈한다. 수동 폭·종류별 크기·공용 좌표는 유지한다. 캔버스 자체의 브라우저 자동 스크롤로 도구 좌표가 밀리지 않게 한다.
- ‘내용 보기’는 메모판 여백을 제외해 내용 카드에 맞춘다. 메모판만 있으면 전체 보기로 동작한다. 기존 전체 보기·초기 뷰포트 복원은 유지한다. 태블릿에서는 줌과 도크를 다른 행에 둔다.
- AI 설정을 선택 카드의 화면 고정 ‘개인정보’ 메뉴로 옮기고 카드·전역 설정 범위를 안내한다. Tab·Space·Escape가 캔버스 단축키와 충돌하지 않게 한다. 즉시 AI 토글은 편집·연결 조작 옆에서 제거한다.
- 도크의 이름과 더 보기 설명, 첫 보드의 메모 만들기 안내, 크기 패널의 정사각형·내용 높이·비율·폭 한계, 파일함 열기·메모 개수 안내를 보강한다.
- 링크 미리보기 로딩·실패·재시도와 늦은 응답 방어를 제공한다. 사진·파일 선택 전에 공통 제한값과 저장 위치를 안내한다. 공유 전 하위 파일함·첨부·접근/해제 범위를 설명하며, 영구 삭제는 대상 이름·개수를 확인한다.
- 보드와 펼친 창에 실제 로컬 저장 상태·실패·재시도와 자동 저장 설명을 제공한다. 문서 원본의 IndexedDB 트랜잭션 완료와 미러 저장을 추적하며, 공유 연결 성공을 서버 영속 완료로 표시하지 않는다.
- 실패 중 보드 재진입은 최신 문서를 유지한다. 제목 저장은 실패한 본문 미러를 함께 복구한다. 삭제 경계에서 남은 재시도를 취소한다. 무변경 콜백·자동 크기 측정이 본문 수정일을 바꾸지 않게 한다.

Dock 자체에는 파일 입력이 없다. 사진 카드를 만든 뒤 실제 파일 선택을 제공하는 PhotoContent에 제한 안내가 있으므로 같은 안내를 Dock에 중복 삽입하지 않았다.

## 최종 자동 검사

실행 위치는 GOAT 관리 `dongpark` 체크아웃이다. 로컬 호스트 자원 압력 때문에 원격에서 실행하고 소스 해시를 대조했다. [최종 검사 보고서](../docs/verification/ux-review-final/repair-report.md)와 [아티팩트 체크섬](../docs/verification/ux-review-final/SHA256SUMS.txt)을 보존했다. 원본 로그·패치는 [압축 아카이브](../docs/verification/ux-review-final/original-export.tar.gz)에 그대로 두고, 읽기용 로그 사본의 CR·줄 끝 공백만 정리했다. [형식 설명](../docs/verification/ux-review-final/README.md).

| 검사 | 명령 | 결과·증거 |
|---|---|---|
| 전체 테스트 | `NODE_OPTIONS=--no-experimental-webstorage bun run test --maxWorkers=2` | **PASS: 237파일, 2,078 통과 / 0 실패 / 기존 8 skip**, [로그](../docs/verification/ux-review-final/full-test-repair-mw2.log) |
| 타입 | `tsc --noEmit` | **PASS: exit 0**, [기록](../docs/verification/ux-review-final/repair-report.md) |
| 린트 | `bun run lint` | **PASS: 오류 0, 기존 경고 3**, [로그](../docs/verification/ux-review-final/lint-repair.log) |
| i18n | `bun run check:i18n` | **PASS: 누락 없음, unused 키 경고**, [로그](../docs/verification/ux-review-final/i18n-repair.log) |
| 표준 빌드 | `NEXT_TELEMETRY_DISABLED=1 bun run build` | **PASS: Next 16.4.5 Turbopack, 정적 페이지 8/8**, [로그](../docs/verification/ux-review-final/build-repair.log) |

기존 skip 8개는 비활성 흔들림 5개, 숨긴 도크 기능 2개, 숨긴 승격 토스트 1개다. 새 skip이나 테스트 삭제는 없다. 기존 no-op 수정일 단언은 승인된 UX-15 동작에 맞춰 ‘증가’에서 ‘유지’로 바꾸고 실제 편집 검증을 유지했다. 전체 병렬 검사에서 초대 화면의 1초 대기 한도를 넘긴 사례가 있었으며, 단독 12개×4회와 자원에 맞춘 최종 2-worker 전체 실행은 통과했다. 초대 동의 단언·타임아웃·실행 설정 파일은 변경하지 않았다.

## 독립 검토와 실패 수정 이력

1차 독립 검토는 패치 `47575de2…`에서 **2,067 통과 / 4 실패 / 8 skip** 및 제품 결함 4건을 보고했다. 아래 지적을 모두 수용하고 수정했다. 단순 저장 상태 UI 테스트에 그치지 않고 실제 IndexedDB abort·A→B→A 이동·실패한 본문 미러·영구 삭제 후 재시도로 재현했다. [저장 수정 기록](../docs/verification/ux-save-review-fixes.md).

| ID | 문제 | 최종 결과 |
|---|---|---|
| R1-source-reentry · P1 | 저장 실패 중 A→B→A 이동에서 낡은 문서를 열고 저장 완료 표시 | **PASS**: 닫기 전에 같은 핸들을 보관, 독립 probe와 소스 재검토로 종결 |
| R1-title-mirror · P1 | 제목 저장이 실패한 본문을 복구하지 않고 오류를 지움 | **PASS**: 같은 미러 큐·트랜잭션에서 복구, 독립 probe 통과 |
| R1-retry-resurrection · P1 | 삭제한 프레임이 남은 재시도로 되살아남 | **PASS**: 권위 있는 삭제 경계에서 재시도·예약 취소, 독립 probe 통과 |
| R1-privacy-keyboard · P2 | 전역 Tab·Space가 개인정보 조작을 방해 | **PASS**: 기본 키 동작은 유지하고 전역 전파 차단, 독립 키보드 회귀 통과 |

3차 독립 검토는 제품 소스 해시가 정확히 일치함을 확인하고 위 4건의 종결을 검증했다. 공유 문구도 서버·sync의 하위 보드/첨부·해제 동작과 대조했다. 추가 제품 결함은 보고되지 않았다. 다만 전체 테스트는 **2,063 통과 / 15 실패 / 8 skip**으로 수정 요청이었다. [당시 보고서](../docs/verification/ux-review-final/PRIOR-report-round3.md)는 과거 실패 증거로 보존한다.

최종 보완은 테스트 3개 파일뿐이다. 모바일 훅 모킹의 누락된 export, jsdom CSSOM을 통한 기대값 정규화, undo 테스트의 실제 TooltipProvider 문맥을 보완했다. 오프셋 84px/20px·안전영역·undo 폭/x 단언은 유지했다. 초대 화면의 간헐 실패는 자원 압력으로 분류하고 코드를 바꾸지 않았다. [델타](../docs/verification/ux-review-final/round3-test-repair.delta.patch.gz)를 부모가 직접 검토·적용한 뒤 511개 최종 해시를 대조했다. 독립 검토 이후 제품 소스 변경은 없다.

1차 원격 Codex 사용량 제한 및 원격 `continueFrom` 미지원으로 새 검토자에게 이전 지적·수정·미확인 범위를 전달했다. 3차 보고서가 추가 검사 대기 상태로 조기 종료돼 별도 검사 작업이 기존 로그를 보존하고 최종 검사를 마쳤다. 이를 독립 검토자의 무조건 승인으로 표현하지 않는다.

## 실제 화면 검증

인증만 제외한 임시 QA 경로에서 실제 Canvas·Dock·표·Yjs·IndexedDB 컴포넌트를 사용했다. 인증·두 계정 협업 검증을 대신하지 않는다. [화면·측정 자료](../analysis/ui-ux-review/2026-11-13/).

- Chromium 320/390/820/1280px: 빈 항목 3종 유지, 빈 링크 검색 결과 1개와 초기화 후 3개, 내부 표식 비노출을 확인했다. 320/390/820px에서 문서 가로 넘침이 없었다.
- 600자 긴 텍스트는 내용 폭/scrollWidth가 452px로 같고 `overflow-wrap:anywhere`로 줄바꿈했다. 390px에서 캔버스 자동 스크롤 136px를 발견해 `overflow:clip`으로 바꾼 뒤 0px를 확인했다.
- 820px에서 줌/도크 겹침을 발견해 별도 행으로 바꾼 뒤 줌 bottom 816px / 도크 top 824px로 간격 8px를 확인했다([화면](../analysis/ui-ux-review/2026-11-13/canvas-820.png)). 320px에서도 하단 도구가 화면 안에 있었다([화면](../analysis/ui-ux-review/2026-11-13/canvas-320.png)).
- 실제 사진 파일 선택과 이미지 표시를 확인했다. 모든 파일 형식·드롭·새로고침 복원 조합을 검증한 것은 아니다.
- iPhone 18 Pro / iOS 27.0 **시뮬레이터의 Safari·XCTest**: 빈 항목 3개, 자동 저장 설명, 펼친 빈 링크의 표식 제거를 확인했다. 일반 메모 제목을 입력하고 앱 완료 버튼으로 닫은 뒤 Safari 새로고침·표 전환에서도 유지됐다([화면](../analysis/ui-ux-review/2026-11-13/safari-title-after-reload.png)). 물리 iPhone 증거가 아니다.
- Android는 SDK Command-line Tools 누락으로 GOAT에서 사용 불가였다. 물리 펜·Android IME·가로모드 전체 조합은 확인하지 못했다.

개발 실행과 테스트에 변경하지 않은 `shared/doc-model`의 ‘Add Yjs type to a document before reading data’ 경고가 관찰됐다. 원인은 별도 조사하지 않았으며, 경고 없는 실행으로 보고하지 않는다. 초기·중간 화면(`table-390-initial.png` 등)은 최종 화면과 구분한다.

## 완료 조건별 판정

PASS는 아래 증거가 충족하는 조건이다. 일부만 검사한 복합 조건은 전체를 PASS로 올리지 않고 UNVERIFIED로 둔다.

| AC | 판정 | 근거·미확인 범위 |
|---|---|---|
| UX-01 내부 표식·정상 사용자 코드 | PASS | 검색·행·펼친 창 회귀와 Chromium/Safari 확인 |
| UX-02 빈 항목 보존·유형 검색 | PASS | 유형/제목/첨부/손그림/체크 파생, 표 재마운트·검색 회귀, 실제 3종 표시 |
| UX-03 긴 텍스트·모든 폭/확대/입력 | UNVERIFIED | 600자·320/390/820px 확인. 긴 URL·XL·한영 혼합·가로·브라우저 200% 조합 미실행 |
| UX-04 실제 로컬 저장·실패·역전 | PASS | IndexedDB abort·지연/재진입·미러 실패·재시도·삭제 회귀, 상태 UI 테스트·정상 새로고침 유지 |
| UX-05 닫기·링크 취소·Android IME | UNVERIFIED | 저장/닫기/링크 회귀와 Safari 제목 유지 통과. Android IME 미실행 |
| UX-06 명시적 AI 설정·범위 | PASS | 설정 변경/무변경·Escape 포커스·Tab/Space 전파 회귀, 좁은 화면 개인정보 UI 확인 |
| UX-07 도구 이름·터치 생성 | UNVERIFIED | Dock 컴포넌트 회귀·Chromium/Safari 이름 확인. Android 실제 생성 흐름 미실행 |
| UX-08 유형·파생 제목·무변경 읽기 | PASS | 파생/표/검색 회귀, 실제 표의 유형·미리보기 확인 |
| UX-09 필터·초기화·작업 대상 | PASS | 디바운스 취소·칩·선택 대상 통합 테스트, 실제 결과 수/초기화 확인 |
| UX-10 내용 보기·좌표 보존 | PASS | 프레임 제외/빈 프레임 fallback 회귀와 실제 내용 보기·크기 유지 확인 |
| UX-11 크기·제한·undo·다양한 입력 | UNVERIFIED | 크기·undo 회귀 통과. Android/마우스 전 배율·배경 조합의 실측 미실행 |
| UX-12 첨부 안내·실제 입력/복원 | UNVERIFIED | 제한·오류 회귀와 사진 선택/표시 통과. 드롭·모든 형식·재로드 복원 미실행 |
| UX-13 공유·접근·해제 | UNVERIFIED | 서버/sync 근거와 문구·컴포넌트 확인. 실제 두 계정 공유/해제 미실행 |
| UX-14 삭제 대상·undo·실제 UI | UNVERIFIED | 휴지통·undo·파일 보존·재시도 부활 회귀 통과. 실제 UI 전체 삭제 조합 미실행 |
| UX-15 열람 수정일·협업 보존 | UNVERIFIED | 무변경/측정/본문/제목 저장 회귀 통과. 두 클라이언트 전후 비교 미실행 |
| UX-16 키보드·스크린리더·IME | UNVERIFIED | 접근성 이름·포커스·설정 키 회귀와 Safari 제목 입력/완료 확인. 실제 스크린리더·Android IME 미실행 |

## 정리·전달

소유 QA 보드는 전용 정리 버튼으로 제거하고 임시 QA 라우트·개발 서버를 삭제/종료했다. Next가 자동 생성한 AGENTS 변경도 되돌렸다. 검사에는 QA 라우트가 없다. 화면·보고서·로그는 작업 산출물로 보존한다.

NOT RUN: 실제 두 계정 협업/공유·해제, 물리 Android/iPhone·펜, 모든 배율·가로·IME·브라우저 확대 조합, CI·push·PR·merge·운영 배포. 위 UNVERIFIED 항목은 제품 전체 인수 완료로 주장하지 않는다.
