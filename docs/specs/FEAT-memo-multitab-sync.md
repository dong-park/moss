# FEAT-memo-multitab-sync (W8)

**Status**: ✅ complete (2026-06-04) — feat/memo-editor-seams 합본 머지. **Squad**: [[_squad-memo-production]] · [[FEAT-memo-editor-seams]]
**심각도**: 🟡 중(조용한 덮어쓰기).

## 1. 목표
두 탭이 같은 보드를 열었을 때 한쪽 편집이 다른 쪽을 조용히 덮어쓰지 않도록 외부 변경을 반영한다.

## 2. 범위
**포함:** `state/db/liveSync.ts` — BroadcastChannel(또는 Dexie liveQuery) 구독으로 다른 탭의 카드 변경을 수신해 현재 편집 중이 아닌 카드를 store에 반영. store init 1곳에서 구독 시작.
**제외:** 실시간 협업(원격), CRDT 병합. 같은 카드 동시 편집 충돌은 "표시"까지(자동 병합 아님).

## 3. 수용 기준
- **AC-1** Given 탭 A에서 카드 수정·저장, When 탭 B 활성, Then B의 해당 카드가 갱신 반영(편집 중 아니면).
- **AC-2** Given 탭 B가 같은 카드 편집 중, When A가 그 카드 변경, Then B 편집 내용 보존 + "다른 탭에서 변경됨" 표시(덮어쓰기 금지).
- **AC-3** 카드 생성·삭제·이동도 탭 간 반영.
- **AC-4** 단일 탭에서는 오버헤드·중복 이벤트 0.

## 4. 의존성
P0(cardPersist가 기록 시 broadcast 발신 지점 제공이면 이상적 — 없으면 liveSync가 Dexie 변경 훅 사용). W1 flush와 협조(저장 시 broadcast).

## 5. 데이터 모델
변경 없음. 메시지: `{ type: 'card-upsert'|'card-delete', boardId, id, updatedAt }`. updatedAt로 stale 무시.

## 6. 인터페이스
```ts
// state/db/liveSync.ts
export function initLiveSync(): () => void;   // 구독 시작, dispose 반환
export function broadcastCardChange(msg: CardSyncMsg): void;
```

## 7. 시각·인터랙션
충돌 시 카드/모달에 "다른 탭에서 변경됨 · 새로고침" 비방해 배너.

## 8. 비기능
자기 발신 메시지 무시(탭 id). 편집 중 카드는 반영 보류(커서 보호). 디바운스로 폭주 방지.

## 9. 다음 iteration
원격 동기화·계정 간 동기화(freemium/storage와 합류).

## 10. DOD
- [ ] liveSync 구독·발신, 편집 중 카드 보호, stale 무시
- [ ] 충돌 표시, AC-1~4, tsc 0, 단위 테스트
