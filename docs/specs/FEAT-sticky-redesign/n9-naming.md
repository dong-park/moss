# n9-naming — 보드→프로젝트, 함→파일함

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다. 코드 변경이 i18n 값뿐이면 `/work`로 돌려도 된다.

**deps**: 없음
**상태**: done

## 문제

새 구조에서 "보드"(캔버스 한 장)는 프로젝트, "함"(하위 캔버스 카드)은 파일함이다. 화면 글자가 옛 이름 그대로다.

## 목표

한국어 화면에서 "보드" 글자가 없고 그 자리는 "프로젝트", "함"은 "파일함"이다. "머무는 생각" 이름은 그대로다. 코드 식별자(board 등)는 바꾸지 않는다(spec 비목표).

## 작업

1. `web/src/i18n/messages/ko.json`에서 "보드"·"함"이 들어간 값을 찾아 치환. 조사("보드를"→"프로젝트를", "함에"→"파일함에") 자연스럽게.
2. i18n 키를 거치지 않고 하드코딩된 한국어 "보드"·"함"이 있으면 키로 옮긴다: `grep -rn "보드\|[^파일]함" web/src --include='*.tsx'`로 후보를 보고 판단.
3. 영문 등 다른 로케일 파일이 있으면 같은 의미로 맞춘다(없으면 생략).
4. 스냅샷·문구 단정 테스트가 깨지면 새 문구로 고친다.

## 완료 기준

- [x] plan 공통 완료 기준 전부 (단, 기준선에 이미 있던 7개 vitest 실패 제외 — 아래 참고)
- [x] `grep -c "보드" web/src/i18n/messages/ko.json` 결과 0
- [x] `cd web && bun scripts/check-i18n.mjs` 통과 (exit 0, "unused keys" 경고는 기존 상태 — 실패 아님)
- [x] spec AC-13 명칭 항목: BoardPicker·Breadcrumb·삭제 대화상자에 "프로젝트"/"파일함"이 보인다(컴포넌트 테스트로 확인, 아래 참고)
- [ ] 실경로: dev 서버 첫 화면·파일함 안 화면 스크린샷 — 이번 워크트리 환경 제약으로 못 얻음(아래 갭 참고)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/i18n/messages/ko.json` | 한국어 문구 |
| `web/scripts/check-i18n.mjs` | 누락 키 검사 |
| `web/src/components/workspace/BoardPicker.tsx` | 상단 드롭다운 |
| `web/src/components/workspace/Breadcrumb.tsx` | 파일함 경로 |
| `web/src/components/workspace/BoardDeleteDialog.tsx` | 삭제 대화상자 |

## 구현 메모

**변경 파일**
- `web/src/i18n/messages/ko.json` — `workspace.boardPicker.*`(label·systemNote·newBoard·unnamed·renameInput·deleteConfirm·deleteDescription·deletedToast), `workspace.system.drop.{toastBody,newBoard}`, `workspace.tool.board`, `workspace.subcanvas.deletedToast`, `templates.picker.defaultBoardName`, `templates.free.description`, `templates.project.name`, `templates.research.name`, `templates.diary.name`의 "보드"/"함"을 치환.
- `web/src/components/workspace/SystemBoard.tsx:32` — i18n을 안 거치는 하드코딩 `aria-label="시스템 보드 큐레이팅"` → `"시스템 프로젝트 큐레이팅"` (스크린리더로 읽히는 실제 화면 글자라 grep §10 기준에 포함시켰다. 판단: 호출자가 필요시 되돌릴 것).
- `web/src/components/workspace/__tests__/BoardPicker.test.tsx`, `.../TemplatePicker.test.tsx` — 새 문구로 문자열 단정 갱신. `it(...)` 설명 문자열(테스트 이름)은 화면 글자가 아니라 그대로 뒀다.

**호출자가 정할 것 — 판단이 필요했던 치환**
- `workspace.tool.board`(사이드바 "함" 생성 도구 라벨, Sidebar.tsx:68 참고)는 "보드"였지만 실제로는 함(서브캔버스)을 만드는 도구라 "프로젝트"가 아니라 "파일함"으로 옮겼다. n8-dock이 이 도구를 독으로 흡수할 때 라벨이 다시 "파일함" 그대로인지 확인 필요.
- `templates.project.name`: "프로젝트 보드" → "프로젝트 프로젝트"가 되는 충돌을 피해 "프로젝트"로 축약. `templates.research/diary.name`은 "리서치 프로젝트"/"일기 프로젝트"로 자연스럽게 치환.
- `web/src/state/workspace.ts:1067,1078,1099`의 `throw new Error("시스템 보드는...")`는 UI에 노출되지 않는 방어적 내부 에러 메시지로 보고 손대지 않았다(브리프 범위는 "화면 글자").

**갭 — dev 서버 스크린샷 실경로 검증 못 함**
- 이 워크트리는 `moss/web/node_modules`가 원본 리포 경로로의 심링크다. Next 16은 Turbopack 전용(webpack 옵션 없음)인데 Turbopack이 "Symlink [project]/node_modules is invalid, it points out of the filesystem root"로 fs root 밖을 가리키는 심링크를 거부해 `next dev`가 기동하지 않는다(환경 제약, n9 코드와 무관).
- 대신 `BoardPicker.test.tsx`(실제 렌더된 DOM에서 "프로젝트 선택"/"(시스템 프로젝트)"/"(이름 없는 프로젝트)"/"새 프로젝트 만들기"/"프로젝트 이름 변경"/"이 프로젝트를 삭제할까요?" 단정)와 `TemplatePicker.test.tsx`("프로젝트"/"리서치 프로젝트"/"일기 프로젝트" 단정)로 AC-13 명칭 부분을 검증했다. 호출자가 심링크 대신 실제 install(`npm install` 등)로 dev 서버를 띄울 수 있는 환경이면 n10-finish 단계에서 스크린샷 대조를 추가로 받는 게 안전하다.
