# FEAT-memo-empty-cleanup (W7)

**Status**: ⛔ 폐기 (2026-09-19) — [[FEAT-memo-empty-keep]]로 대체. **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟡 중.

## 1. 목표
내용 없이 blur된 빈 메모 카드가 캔버스에 잔류하지 않게 자동 정리한다.

## 2. 범위
**포함:** workspace `deleteCardIfEmpty(id)` 액션 + text/Content blur 훅 연결. 본문·overlay(펜) 모두 비었고 방금 생성됐다 비워진 경우만 삭제. fade-out 후 제거.
**제외:** 이미 내용 있던 카드(보존), 다른 카드 종류.

## 3. 수용 기준
- **AC-1** Given 새 메모 생성 후 한 글자도 안 쓰고 blur, When blur, Then 카드 자동 삭제(fade-out).
- **AC-2** Given 본문은 비었지만 펜 그림 있음, When blur, Then 보존(overlay도 콘텐츠).
- **AC-3** Given 내용 있던 메모를 전부 지우고 blur, Then 삭제하지 않음(의도적 비움일 수 있음) — 또는 confirm. **기본: 삭제 안 함**(데이터 보호 우선).
- **AC-4** 삭제는 undo 토스트로 복원 가능.

## 4. 의존성
P0(blur 경로). 기존 카드 삭제·undo 인프라(workspace).

## 5. 데이터 모델
변경 없음(삭제만). undo 스택에 삭제 기록.

## 6. 인터페이스
```ts
// state/workspace.ts (append)
deleteCardIfEmpty: (id: string) => void;   // 본문 trim 0 && overlay 빈 && wasNeverFilled
```
`wasNeverFilled` 판정: 생성 후 onChange로 비공백이 한 번도 안 들어온 카드(플래그 또는 createdAt 근접).

## 7. 시각·인터랙션
fade-out 150ms 후 제거. undo 토스트 "빈 메모 삭제됨 · 실행취소".

## 8. 비기능
삭제는 보수적(거짓 양성 0이 목표 — 사용자 콘텐츠 절대 임의 삭제 금지). 모호하면 보존.

## 9. 다음 iteration
빈 카드 일괄 정리 커맨드.

## 10. DOD
- [ ] deleteCardIfEmpty + blur 훅, overlay 보존, never-filled 판정
- [ ] undo 복원, AC-1~4, tsc 0, 단위 테스트
