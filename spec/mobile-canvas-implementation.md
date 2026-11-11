# 모바일 조작 구현 기록

상태: 진행 중. 기준 `e351374`, 브랜치 `feat/mobile-canvas-interactions`. 운영 배포·push 없음.

계획: [해결 계획](mobile-canvas-interaction-plan.md).

## 현재 구현

- 빈 링크의 모바일 앞면에서 상시 활성 URL input 제거.
- 하단 선택 도구와 별도 URL 시트. 초안은 완료 전 저장하지 않음. 취소·뒤로가기는 기존 주소 유지.
- URL 충돌·원본 삭제 확인, visualViewport 추적 공유, 같은 주소의 history entry로 편집 화면 먼저 닫기.
- 탭 연결의 임시 상태·확정 함수 구현. 캔버스 포인터 배선은 리사이즈 작업 통합 후 진행.
- 크기 조절 수치·증감 UI 작성. 공통 크기 계산 함수 통합 대기.

## 검증 기록

- `LinkInputFace.mobile.test.tsx`: 수정 전 활성 input 때문에 1개 실패(RED), 수정 후 통과(GREEN).
- 링크 시트·모바일 상태·기존 링크 관련 실행 17개 통과. 이후 링크/상태/앞면 13개 통과.
- `MobileCardControls.test.tsx`: 3개 중 2개 통과, 탭 연결은 배선 전이라 연결선 0개로 실패. 이 실패를 생략하지 않고 통합 후 확인한다.
- 수치 입력 UI 2개 통과. 이후 입력 동기화 변경으로 재실행 필요.
- typecheck·변경 구현 lint 0 오류 확인. 이후 수정이 있어 최종 재실행 필요.
- Ego TaskSpace 27의 로컬 임시 QA 페이지에서 빈 링크 탭은 input 없음·BODY 포커스·선택 도구, 수정 후 취소는 빈 카드 유지 확인.
- Android 로컬 변경 화면: 빈 링크 선택은 IME 닫힘. 주소 수정 버튼은 시트·IME 표시. 입력칸 bottom 약139px, 완료 bottom 약199px로 visibleViewport 약359px 안에 위치.
- Android 시스템 뒤로가기: 첫 번은 키보드만 닫고 편집 유지, 두 번째는 편집 종료·같은 페이지 유지. 취소도 빈 링크 유지.

## 진행 중인 통합

리사이즈 분리 작업: 원격 `dongpark`, child `mcp:9b66ea33-f4a3-4ae9-8a5f-dd3340f7bb35`.

- 초기 보고: 포인터 38개·인접 58개 통과, 링크/할 일 정사각형 강제 관련 회귀 3개 실패.
- 부모가 `workspace.ts`의 자동 높이 정규화까지 수정 범위를 확장해 후속 실행 승인. 자식 ordinal 2 진행 중.
- 최종 코드·patch·새 검증 결과를 받아 검토하고 로컬에 통합해야 한다. 자식 보고만으로 완료 처리하지 않는다.
- 예정 API: `cardSizing.ts`의 `resizeCardDimensions(id, {width,height?})`, `ResizeHandles`의 선택적 `mobile` prop.
- 자식이 맡은 `touchCanvas.ts`는 부모가 아직 수정하지 않았다. 통합 후 연결 모드에서 interactive target보다 먼저 tap 처리, pan과 tap 구분, synthetic checkbox click 억제를 추가한다.

## 개발 검증 환경 — 종료 시 정리

- 임시 검증 페이지 `web/src/app/mobile-interaction-qa/page.tsx`: 실제 Canvas·Dock과 로컬 저장소를 사용. 최종 commit/build 전에 제거한다. 인증 경로를 검증한 것은 아니다.
- Webpack dev 서버: 127.0.0.1:3309. Ego TaskSpace 27, page p1. 기존 재현 공간 26을 복구한 것이 아니라 구현 검증용 별도 공간이다.
- Android: SM-N986N, serial R3CR505E55E, Android13 Chrome157. owned adb reverse3309/forward19224. 현재 테스트 출처 localhost:3309만 조작하며 visible 탭·전면 Chrome을 검사한다.
- 결과 경로 `/tmp/moss-mobile-implementation-20261112/`. HMR로 QA 보드/카드 ID가 바뀔 수 있어 최종 안정 코드에서 중요 과업을 다시 실행한다.
- old Ego 운영 샘플 정리는 여전히 미확인이다. [조사 기록](mobile-canvas-interaction-research.md) 참조.

NOT RUN: 리사이즈·탭 연결 통합 후 회귀/전체 테스트, 최종 typecheck/lint/i18n/build, 독립 코드 검토, 최종 Android 크기·연결·줌/undo, iPhone, 임시 QA 페이지·보드·세션 최종 정리.

## 통합 1차 검증 (2026-11-12)

- 리사이즈 원격 commit `2feecd3a9481b55b2a58e20879ff6f31e0f49f42`의 diff를 검토하고 patch SHA256 `815e0037c3ccad9c4054c314bf438cd777fe6aaa48e61204fdc886029fe66d21` 확인 후 적용했다.
- 수치 UI를 공통 크기 계산에 연결하고, 연결 모드의 캔버스 포인터·호환 click 억제를 구현했다.
- `bun run --cwd web test` + Canvas.touch/MobileCardControls/MobileLinkEditor/MobileResizeControls/ResizeHandles.touch/cardSizing/mobileCanvas/LinkInputFace.mobile의 8개 파일: **60 passed**.
- 이후 추가한 interactive target 호환 클릭·hybrid mouse 연결을 포함한 MobileCardControls: **5 passed**.
- `cd web && ./node_modules/.bin/tsc --noEmit`: exit 0.
- 모바일 핸들이 크기 조절 모드에서만 표시되는 정책에 맞춰 새 리사이즈 회귀 테스트가 명시적으로 모드에 진입하도록 통합했다. 기존 크기·pan 불변·undo 단언은 유지했다.
- 위의 진행 중/대기 문구는 초기 기록이다. 현재 연결 배선과 크기 계산은 통합됐으며 전체 검증과 실제 화면 최종 검증을 진행한다.
