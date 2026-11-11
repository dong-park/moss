# 모바일 캔버스 구현·검증 결과

로컬 구현·검증을 마쳤다. 코드 기준은 `e351374` → `6c23ac9`, 브랜치는 `feat/mobile-canvas-interactions`다. 최종 코드 tree `6649d8ac264447fef3b13e8da5bf79dcb20381e2`가 독립 검증 tree와 일치하며 이후 제품 코드 변경은 없다. 배포·push·PR은 하지 않았다.

[승인된 계획](mobile-canvas-interaction-plan.md), [이전 조사](mobile-canvas-interaction-research.md). 아래 기기·실행환경 한계를 전체 플랫폼 통과로 해석하지 않는다.

## 변경 동작

- 기존 모바일 링크는 한 번 탭하면 선택한다. 외부 열기는 별도 버튼이다. 신규 링크는 주소 입력 화면을 바로 연다.
- 주소 시트는 캔버스 바깥에서 로컬 초안을 편집한다. 완료만 저장하고 취소·뒤로가기는 원본을 유지한다. 저장 시 원본 삭제·동시 URL 변경을 검사하며 기존 URL 검증·늦은 미리보기 응답 방지를 재사용한다.
- 단독 선택 도구가 추가 도크를 대신한다. 연결은 출발 선택→연결→대상 탭이다. 대상의 링크·입력·체크 동작보다 먼저 처리하고 호환 click도 억제한다. 이동은 pan으로 구분한다.
- 크기 조절은 포인터를 캔버스와 별도로 소유한다. 터치 hit 영역은 화면상 48 CSS px이며 증감·수치 입력도 제공한다. 숫자 입력칸은 제한을 적용한 실제 크기를 표시한다. 주소 시트와 숫자 도구는 visualViewport에 맞춰 키보드 위로 이동한다.
- 자동 높이 링크·할 일·textbox는 폭만, 종이는 정사각형, 사진은 비율, 프레임은 기존 크기·소속 규칙을 적용한다. 한 드래그/수치 확정은 undo 한 단계다. 취소·capture 소실·두 번째 손가락·언마운트에서 소유권과 undo 그룹을 닫는다.
- 데스크톱 자동 높이 카드의 조절점과 연결점을 분리했다. Space를 누른 마우스·펜 입력은 기존 pan 처리자에 양보한다. 하이브리드 기기의 입력 종류가 바뀌어도 진행 중인 조작을 보존한다.

주요 진입점: `web/src/components/workspace/Dock.tsx:359`, `MobileCardControls.tsx:17`, `MobileLinkEditor.tsx:12`, `touchCanvas.ts:30`, `ResizeHandles.tsx:124`. 임시 조작은 `mobileCanvas.ts`, 공통 크기 계산은 `cardSizing.ts`에 있다. 저장 형식·서버 API·의존성 변경은 없다.

## 최종 자동 검증

원격 GOAT 관리 작업 트리의 설치 버전은 Node26.6.0 /Bun1.4.4 /Vitest4.1.12 /Next16.4.5다. 아래 명령은 모두 `web/`에서 최종 코드에 실행됐으며 exit0이다.

| 명령 | 결과 |
|---|---|
| `NODE_OPTIONS=--no-experimental-webstorage bun run test` | 216 files, **1977 passed /기존8 skipped**, 실패0·미처리 오류0 |
| `./node_modules/.bin/vitest run` + 아래 집중11개 파일 | **100 passed /기존 Dock2 skipped**, 실패0·미처리 오류0 |
| 독립 reviewer probe3개 config | **13 passed**, skip0·실패0·미처리 오류0 |
| `./node_modules/.bin/tsc --noEmit` | 진단 없음 |
| `bun run lint` | 오류0·기존 경고3 |
| `./node_modules/.bin/eslint` + 변경32개 TS/TSX 파일 | 진단 없음 |
| `bun run check:i18n` | 누락 오류0, unused75개 안내 유지 |
| `bun run build --webpack` | compile·TypeScript·static8/8 완료, 임시 QA route 없음 |
| `git diff --check` 및 독립 임시 index의 tree 비교 | 진단 없음, 위 최종 코드 tree 일치 |

집중 파일: `Canvas.touch`, `Dock`, `MobileCardControls`, `MobileLinkEditor`, `MobileResizeControls`, `ResizeHandles.touch`, `cardSizing`, `mobileCanvas`, `LinkInputFace.mobile`, `MobileHybrid`, `MobileHistory`의 test 파일이다. 전체 suite skip8개는 기존 Dock 숨김 도구2, 비활성 wobble5, 숨김 toast1이다. 새 skip이나 단언 완화는 없다.

Node26의 experimental webstorage 기본 실행에서는 기준 코드에서도 `storage.test.ts:67`, `freshV5.test.ts:134` 두 실패가 재현됐다. 호환 옵션은 jsdom이 storage를 제공하게 하는 실행환경 분리이며 테스트·의존성을 바꾼 것이 아니다. 최종 전체 통과는 위 옵션을 명시한 결과다. 최종 기본 Node26 전체 명령은 재실행하지 않았다.

독립 리뷰의 F1~F4와 추가 펜 지적을 모두 반영했다. 최종 [독립 검토](goat-thread://v1/mcp:87ff69fc-a8a9-4939-8b52-778bfe224655)는 **APPROVE, 미해결 P0/P1/P2 0개**다. 상세 명령·출력 보고서는 로컬 `/tmp/moss-mobile-implementation-20261112/review-final.md`에 보존했다.

부모 작업 트리에서도 빈 링크 input, 터치 리사이즈, 키보드 가림, 하이브리드 연결, history 전환, 숫자 제한, Space+마우스/펜 회귀의 RED를 확인한 뒤 수정했다. 최종 펜 수정 후 `bun run --cwd web test src/components/workspace/__tests__/Canvas.touch.test.tsx src/components/workspace/__tests__/ResizeHandles.touch.test.tsx`는35개 통과했다. 독립 검토도 기존 probe를 약화하지 않고 재실행했다.

## 실제 클라이언트와 완료 조건

Android13 Samsung SM-N986N, Chrome157, 411 CSS px 화면에서 로컬 변경 코드 `localhost:3309`를 사용했다. 실제 Canvas·Dock·Yjs/IndexedDB를 쓰는 임시 QA 화면이며 운영 인증 경로를 검증한 것은 아니다. 매 native 입력 전에 전면 Chrome과 visible 로컬 탭을 검사했다. 별도 표기가 없으면 ADB가 주입한 native 터치다. Android undo는 CDP 외부 키보드 Ctrl+Z로 확인했다.

Ego TaskSpace27에서도 링크·수치 입력·실제 popup URL, 데스크톱 마우스 리사이즈·Space 이동·Next history 상태 복귀를 확인했다. 물리 펜이나 iPhone으로 간주하지 않는다.

| ID | 판정·증거 | 남은 검증 한계 |
|---|---|---|
| L1 | PASS: 빈/완성 링크 선택은 입력·외부 이동 없음. BODY 포커스, inline input0 | Android/Ego 및 통합 테스트 범위 |
| L2 | PASS: 열기는 지정 `https://example.com/#mobile-qa`를 별도 탭에 열고 편집을 시작하지 않음 | Android/Ego 실제 열기 확인 |
| L3 | UNVERIFIED(부분 검증): 세로 IME visible 높이 약359px 안에 입력·완료·취소 표시. 가로809×331에서도 표시 | 가로 측정 시 IME가 viewport를 줄이지 않아 **가로+IME 조합은 미확인**, Safari 미확인 |
| L4 | PASS: 신규 링크 완료 저장, 취소·시스템 뒤로가기 초안 폐기·원본 유지 | Android 및 저장/상태 테스트 |
| L5 | UNVERIFIED(부분 검증): 삭제 guard·동시 URL 변경 오류·원본 보존은 상태/UI 테스트 통과 | 두 실제 협업 클라이언트 충돌·삭제 미실행 |
| C1 | PASS: 출발→연결→대상 탭으로 선1개·출발 선택 유지 | Android native 및 통합 테스트 |
| C2 | PASS: 약597px pan 후 화면 밖 대상에 두 번째 선 생성. 무효/자기 자신/빈 곳/취소는 no-op 테스트 통과 | Android 및 상태/통합 테스트 |
| R1 | PASS: 196ms·48×24px 드래그에서 폭240→287.755, world(0,0,1) 불변 | `android-head-before/after.json` |
| R2 | PASS: 100%·48.2%·25% native hit 약48.025px. 증감·수치 입력·제한값 표시 확인 | 정확한50%는 자동 테스트, 실제 기기는 UI 단계48.2% |
| R3 | PASS: 25%에서 한 undo로 폭382.72→287.7. 종류/비율/프레임/손그림 회귀 통과 | 기기의 모든 카드 종류 조합은 미실행 |
| G1 | UNVERIFIED(부분 검증): cancel/capture 소실/두 번째 손가락/언마운트 테스트 통과, 기기 Back 모드 종료 확인 | 실제 두 손가락 중단 미실행 |
| G2 | UNVERIFIED(부분 검증): native pan·700ms hold 이동·한 undo, Ego 마우스 resize/Space 이동, 펜 포인터 probe 통과 | 실제 펜·native 두 손가락 pinch·기기 표 전환 미실행 |

`9cde21c`에서 Android 핵심 경로도 재실행했다. 연결1개→resize→한 undo→주소 초안→시스템 뒤로가기 후 폭240, world(0,0,1), inline input0, history operation null, BODY를 확인했다(`android-head-end.json`). 이후 변경은 숫자 표시와 비터치 Space-pan 수정이며 최종 자동 검증에 포함됐다.

자료: [Android 최종 상태](mobile-canvas-evidence/2026-11-12/android-head-end.json), [리사이즈 후](mobile-canvas-evidence/2026-11-12/android-head-after.json), [키보드 가림 전](mobile-canvas-evidence/2026-11-12/android-size-keyboard.png) /[수정 후](mobile-canvas-evidence/2026-11-12/android-size-keyboard-fixed.png), [데스크톱 조절점 전](mobile-canvas-evidence/2026-11-12/ego-desktop-resize-before.png) /[수정 후](mobile-canvas-evidence/2026-11-12/ego-desktop-resize-after.png). 가로 측정 자료는 가로+IME 성공 증거가 아니다.

## 정리·미실행

QA UI의 정상 removeBoard 경로로 각 로컬 출처의 소유 QA 보드를 모두 삭제하고0개를 확인했다. 최초 Ego7/Android6개와 후속 각각2개다. 임시 QA route, 소유 dev 서버, Android 소유 탭, ADB reverse3309/forward19224를 정리했고 Ego TaskSpace27도 keep 없이 종료했다. 원래 저장소와 원래 계획·조사·증거는 수정/삭제하지 않았다. 이전 운영 조사 공간26의 샘플 정리는 여전히 UNVERIFIED이며 이번 소유 QA 보드 정리와 구분한다. 이전 조사 증거의 복사본은 작업 트리에 untracked로 보존했다.

NOT RUN: iPhone Safari(실기기 없음), 실제 협업 클라이언트 충돌/삭제, 가로+IME 조합, 실제 펜·두 손가락 중단/pinch·기기 표 전환, 최종 기본 Node26 전체 suite(기존 환경 실패2건), CI·배포. 위 표의 부분 검증을 전체 플랫폼 PASS로 보고하지 않는다.
