# FEAT-memo-autosave-guard (W1)

**Status**: 📋 todo — C(P0 후). **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🔴 블로커(데이터 유실).

## 1. 목표
debounce 타이머 창 안에서 탭이 닫히거나 카드가 언마운트될 때 마지막 편집이 유실되는 것을 막고, 사용자가 저장 상태를 신뢰하게 한다.

## 2. 범위
**포함:** `flushCard/flushAll`(P0 cardPersist) 호출부 배선 — 에디터 언마운트 시 `flushCard`, `beforeunload`/`visibilitychange:hidden` 시 `flushAll`. 저장 상태 마이크로 인디케이터("저장 중…/저장됨", 1.5s 후 페이드).
**제외:** 다중 탭 충돌(W8), persist 엔진 자체(P0 소유).

## 3. 수용 기준
- **AC-1** Given 편집 후 debounce(예 600ms) 경과 전 카드 언마운트, When 다시 열기, Then 마지막 글자까지 보존.
- **AC-2** Given 편집 직후 탭 닫기 시도, When `beforeunload`, Then `flushAll` 동기 완료(IndexedDB 기록).
- **AC-3** 인디케이터: 타이핑→"저장 중…", flush 완료→"저장됨"→1.5s 페이드. `role=status`.
- **AC-4** flush 실패 시 콘솔 경고 + 인디케이터 "저장 실패" 유지(silent 금지).

## 4. 의존성
P0(`cardPersist.flushCard/flushAll`). 없으면 시작 불가.

## 5. 데이터 모델
변경 없음. 저장 상태는 UI 로컬(persist 안 함).

## 6. 인터페이스
```ts
// _shared/editor/useFlushOnExit.ts (신규)
export function useFlushOnExit(cardId: string): void;  // 언마운트 flushCard + beforeunload flushAll 등록
// state/workspace.ts: flushAll 위임 1줄(cardPersist 재노출)
type SaveState = "idle" | "saving" | "saved" | "error";
```
`beforeunload`는 한 번만 등록(중복 리스너 금지 — 모듈 싱글톤).

## 7. 시각·인터랙션
인디케이터는 카드 우하단 또는 펼침 모달 헤더에 8px 텍스트. 비방해적(편집 가림 금지).

## 8. 비기능
`beforeunload` 동기 경로는 가볍게(대량 직렬화 금지 — 이미 메모리에 있는 카드만 put). 페이지 종료를 막지 말 것(prompt 금지).

## 9. 다음 iteration
오프라인 큐/재시도(W8 동기화와 합류 가능).

## 10. DOD
- [ ] 언마운트·beforeunload·visibilitychange flush 배선
- [ ] 저장 인디케이터 4상태, role=status
- [ ] AC-1~4, tsc 0, 유실 시나리오 단위 테스트
