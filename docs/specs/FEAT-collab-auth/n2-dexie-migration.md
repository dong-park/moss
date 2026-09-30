# n2-dexie-migration — Dexie v6 보드를 Yjs로 자동 이전

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n1
**상태**: done (2026-09-28)

## 문제

기존 사용자의 보드는 Dexie에 있다. 새 버전 첫 실행 때 손실 없이 Yjs 문서로 옮겨야 한다.

## 목표

첫 실행 때 모든 보드가 Yjs 문서로 변환된다. 실패는 보드 단위로 격리되고 원본 Dexie 테이블은 남는다.

## 작업

1. n1의 변환 함수로 보드마다 `Y.Doc`을 채우는 이전 함수를 만든다. 멱등이어야 한다.
2. 보드별 이전 상태(성공·실패 횟수)를 Dexie `settings`나 새 작은 테이블에 기록한다. 원본 `notes`·`boards`·`connections`는 지우지 않는다.
3. 실패 3회면 그 보드에 내보내기 버튼을 띄울 수 있게 상태를 노출한다.
4. 앱 부트 경로에 이전을 건다. `StorageBootstrap` 근처.

## 완료 기준

- [x] spec 공통 완료 기준 전부 — tsc 0, 새 파일 lint 0, 전체 suite는 기준선 실패 1건(Canvas.virtualization) 제외 회귀 0
- [x] AC-2: 보드 3·메모 50·연결선 10·휴지통 5 픽스처가 같은 값으로 변환되고 휴지통·settings는 그대로라는 vitest
- [x] AC-3: 한 보드가 예외를 던져도 나머지는 변환되고 다음 실행에 재시도한다는 vitest
- [x] 성공 기준: 메모 1,000장 보드 변환 5초 이내 vitest
- [x] 실경로: 관통이 프로덕션 경로를 탐. `migrateDexieBoards`가 stub 없이 실제 `IndexeddbPersistence`로 쓰고 다시 열어 검증한다. 단 부트 `StorageBootstrap` 배선은 컴포넌트 테스트 없음(아래 갭)

## 구현 결과

- `web/src/state/db/dexieMigration.ts` — `migrateDexieBoards(db, openDoc?, limit?)`. Dexie의 boards·notes·connections를 읽어 보드 키별 문서로 옮긴다. 모든 쓰기를 한 트랜잭션으로 묶어(메모 1,000장도 y-indexeddb에 1회 저장) 부하를 줄인다. 보드 단위 try/catch로 격리하고, 성공 보드는 `migratedBoards`, 실패는 `migrationFailures` 카운트로 반환한다. 실패 횟수가 `MIGRATION_FAILURE_LIMIT`(3)에 닿으면 자동 재시도를 멈춘다. `boardsAtFailureLimit`가 내보내기 버튼용 보드 목록을 노출한다.
- `web/src/state/db/schema.ts` — `Settings`에 `migratedBoards?`·`migrationFailures?` 추가. 기존 `settings` 행을 그대로 쓰므로 Dexie 버전(7) bump·테이블 추가 없음(스키마 변경 없음).
- `web/src/components/notifications/StorageBootstrap.tsx` — `init()` 뒤 `migrateDexieBoards(getDB())`를 돌리고 결과를 `updateSettings`로 저장. 예외가 나도 부트를 막지 않는다.
- `web/src/state/db/__tests__/dexieMigration.test.ts` — AC-2·AC-3·한도·멱등·1,000장 성능 5케이스.

문서 키는 `boardId ?? SYSTEM_BOARD_ID`. 시스템 보드는 Dexie 행이 없지만 기본 메모가 `boardId=null`로 살아 있어 `moss-board-system` 문서로 옮긴다. 연결선은 `boardId`가 없어 양 끝 메모의 보드로 소속을 정하고, 고아는 시스템 보드에 둬 개수 손실을 막는다.

## 실경로·기준선 갭

- 전체 vitest: 924 passed / 3 skipped / 1 failed. 실패 1건은 `Canvas.virtualization.test.tsx` "viewport 밖 카드는 DOM에 마운트되지 않는다" — HEAD 기준선 실패(n1이 기록, 내 변경과 무관).
- `bun run lint`: 기존 `components/export/ExportModal.tsx`(set-state-in-effect error)·`state/exportStore.ts`(unused warning) 2건이 기준선 실패. 새 파일은 eslint 0.
- `bunx tsc --noEmit`: 0.
- 갭: 부트 배선(`StorageBootstrap`의 `useEffect`)은 컴포넌트 테스트가 없다. 이전 함수 자체는 실제 y-indexeddb 경로를 타지만, "앱이 실제로 이전을 호출하는가"는 tsc·코드리뷰로만 확인했다.
- 갭(가정): 시스템 보드 문서 id를 `SYSTEM_BOARD_ID`("system")로 정했다. n3가 시스템 보드를 열 때 같은 id를 써야 한다. `SYSTEM_BOARD_ID`를 `@/state/workspace`에서 import해 단일 출처로 삼았다.
- 참고: 부트마다 Dexie 전체(boards·notes·connections)를 읽어 이미 이전된 보드를 건너뛴다. 완료 플래그로 스캔을 생략하는 최적화는 이번 범위 밖.

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | v6 스키마. v7이 필요하면 무손실로 올린다 |
| `web/src/components/notifications/StorageBootstrap.tsx` | 부트 경로 |
| `web/src/state/markdownMigration.ts` | 기존 이전 코드 선례 |

## 구현 메모

- n1 계약 (2026-09-28 리뷰 반영): `putNote`·`putBoard`는 `lastVisitedAt`·`lastOpenedAt`을 문서에 쓰지 않는다. 이 값은 Dexie 원본 행에 남는다. 무손실 비교는 `toSharedNote`·`toSharedBoard` 기준 + Dexie 로컬 필드 보존으로 한다.
