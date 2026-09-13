# n9-naming — 보드→프로젝트, 함→파일함

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다. 코드 변경이 i18n 값뿐이면 `/work`로 돌려도 된다.

**deps**: 없음
**상태**: pending

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

- [ ] plan 공통 완료 기준 전부
- [ ] `grep -c "보드" web/src/i18n/messages/ko.json` 결과 0 (spec §10 — "머무는 생각" 설명문 예외면 해당 줄을 `구현 메모`에 명시)
- [ ] `cd web && bun scripts/check-i18n.mjs` 통과
- [ ] spec AC-13 명칭 항목: BoardPicker·Breadcrumb·삭제 대화상자에 "프로젝트"/"파일함"이 보인다(컴포넌트 테스트 또는 dev 서버 스크린샷)
- [ ] 실경로: dev 서버 첫 화면·파일함 안 화면 스크린샷을 `구현 메모`에

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/i18n/messages/ko.json` | 한국어 문구 |
| `web/scripts/check-i18n.mjs` | 누락 키 검사 |
| `web/src/components/workspace/BoardPicker.tsx` | 상단 드롭다운 |
| `web/src/components/workspace/Breadcrumb.tsx` | 파일함 경로 |
| `web/src/components/workspace/BoardDeleteDialog.tsx` | 삭제 대화상자 |

## 구현 메모

