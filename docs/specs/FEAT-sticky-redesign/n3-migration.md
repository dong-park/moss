# n3-migration — 옛 카드 이관과 되돌리기

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n1-db-v5 (legacy 필드·v5 훅), n2-blocks (serializeBlock)
**상태**: done

## 문제

메모를 한 종류로 합치면 이미 저장된 image·link·audio·file·mindmap 카드가 갈 곳이 없다. 사용자 데이터를 바꾸는 되돌리기 어려운 단계라 백업과 되돌리기가 필요하다.

## 목표

v5 업그레이드가 다섯 종류를 text 메모로 한 번만 옮기고, 원본을 `legacy`에 남긴다. `rollbackStickyMigration()`이 편집 안 한 행을 원래대로 되돌리고 건너뛴 개수를 돌려준다.

## 작업

1. `web/src/state/db/migrateStickyV5.ts` 신규. **Dexie `version(5)` 선언은 이 노드가 upgrade와 함께 처음 한다**(n1은 리뷰 지적으로 no-op v5를 뺐다 — 이미 v5로 열린 DB에서는 나중에 넣은 upgrade가 돌지 않기 때문). stores 인덱스는 v4와 동일.
   - image/audio/file → 해당 블록 하나 든 본문(`serializeBlock`). link → 링크 블록(OG thumbUrl·summary는 본문에 안 넣고 legacy.content에만).
   - mindmap → `web/src/state/cardContent.ts`의 `parseMindmap` → 루트부터 DFS, depth d 노드는 `"  ".repeat(d) + "- " + text`. 빈 text 노드도 빈 항목으로 남겨 자식 깊이 보존. 망가진 JSON → 빈 목록 + 백업.
   - 모두 `kind="text"`, width는 메모 기본 폭, height 비움. `legacy = {kind, content, attachmentRef, mediaType, width, height, migratedAt, migratedContent}`.
   - 첨부 OPFS 파일은 절대 지우지 않는다.
2. `rollbackStickyMigration()` export: `legacy` 있고 `content === legacy.migratedContent`인 행만 복원 후 `legacy` 비움. 반환 `{restored, skipped}`.
3. 이관은 Dexie upgrade 트랜잭션 안에서만. 중간 중단 시 Dexie가 롤백하고 다음 실행에 다시 돈다(spec §4 동시성).
4. 테스트 `web/src/state/db/__tests__/migrateStickyV5.test.ts`: v4 DB에 다섯 종류 1개씩 + 망가진 mindmap + 이미 text인 행 → 업그레이드 결과·백업, 형제 순서 보존, 되돌리기(편집한 행 건너뜀), 1,000장 이관 2초 이내.

## 완료 기준

- [x] plan 공통 완료 기준 전부 (tsc/vitest/eslint/i18n — 아래 검증 참고)
- [x] `cd web && npx vitest run src/state/db/__tests__/migrateStickyV5.test.ts` 통과
- [x] spec AC-14: 다섯 행 모두 text, 블록 본문, 들여쓰기 목록 순서 일치, legacy에 원래 종류·본문, 첨부 삭제 0
- [x] spec AC-15: 되돌리기 후 원래 종류·본문, legacy 비움, 편집 행 skipped 카운트
- [x] spec §5 불가능한 조합(원래 종류인데 백업 있음 등) 0건을 테스트가 확인
- [x] 카드 1,000장 이관 < 2s (테스트 내 측정) — 격리 실행 기준. 동시 부하 환경 노트는 구현 메모 참고
- [x] 실경로: 실제 v4 스키마로 DB를 만들고 실제 v5 오픈으로 upgrade를 탄다(함수 직접 호출만으로 green 금지)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | v4까지 선언, frame·frameId·legacy 타입(n1). v5는 여기서 선언 |
| `web/src/state/cardContent.ts` | `parseMindmap` 등 카드 content 파서 |
| `web/src/state/__tests__/cardContent.test.ts` | mindmap 파싱 테스트 패턴 |
| `web/src/components/workspace/cards/mindmap/Content.tsx` | `FlatNode {node, depth}` 평탄화 참고 |
| `web/src/state/db/opfs.ts` | 첨부 저장소(지우지 말 것) |
| `web/src/state/blocks.ts` | serializeBlock(n2) |

## 구현 메모

- `web/src/state/db/migrateStickyV5.ts` 신규: `migrateStickyV5(tx)`(schema.ts v5 upgrade가 호출) + `rollbackStickyMigration(db = getDB())`. `.modify()`(행마다 커서 update) 대신 `toArray()`로 대상 행만 골라 `bulkPut()` — fake-indexeddb의 versionchange 트랜잭션에서 커서 업데이트가 훨씬 느려 1,000장 기준을 못 맞췄다.
- `schema.ts`: v5 선언(n1이 미룬 것)을 v4와 **같은 boards 인덱스 문자열**(`storesV4`, parentBoardId 포함)로 붙였다. 처음에 `stores`(v1 원본, parentBoardId 없음)로 v5를 열었더니 Dexie가 boards 인덱스를 되돌려 `SchemaError: KeyPath parentBoardId ... not indexed`가 나며 subcanvas 테스트 3개가 깨졌다 — `/test` 전체 스위트에서만 잡힌 회귀. 이후 노드가 v6을 추가할 때도 이 패턴(직전 버전 stores 객체를 그대로 물려받기)을 따라야 한다.
- mindmap 이관: brief는 "루트부터 DFS"라 적었지만 실제 UI(`mindmap/Content.tsx`의 `flatten`)는 root 자신을 줄로 안 그리고 `root.children`을 depth 0으로 삼는다 — 이관 결과도 이 규약을 따랐다(루트 자체는 목록에 안 나온다). 망가진 JSON은 `parseMindmap`이 빈 root(children=[])로 graceful default하므로 결과 본문이 빈 문자열(빈 목록)이 된다.
- link 이관: `parseLink`로 url/title을 뽑아 `serializeBlock({type:"link",...})`. null(비허용 스킴)이면 url 원문을 그대로 본문 텍스트로 남긴다(브리프 지시대로).
- image/audio/file 이관 후에도 `note.attachmentRef`/`mediaType` 필드는 지우지 않았다(brief에 명시 없음) — 스코프 최소화 선택. 되돌리기는 legacy 값으로 그대로 복원.
- width는 항상 240(`workspace.widthForKind("text")`와 동일 값을 로컬 상수로 하드코딩) — workspace.ts를 import하면 schema.ts↔migrateStickyV5.ts↔workspace.ts 순환 참조가 생겨 피했다.
- 실경로: `schemaV5.test.ts`(n1 테스트)도 손봤다 — v5가 실제로 선언된 뒤라 `verno`가 4가 아니라 5가 되는 게 맞다(n1 시점 가정이 n3에서 뒤집힘, 브리프에 이미 예고됨).
- **성능 노트**: 이관 1,000장 테스트는 격리 실행(`vitest run migrateStickyV5.test.ts` 단독)에서 1.1~1.5s로 여유 있게 통과한다. 이번 사이클 동안 워크트리 3개(n4/n6/n7)가 같은 머신에서 동시에 돌아 `uptime` load average가 30을 넘었고, 전체 스위트를 병렬로 돌리면 CPU 경합으로 이 테스트가 간헐적으로 2s를 넘겼다(`--no-file-parallelism`로 돌리면 baseline 7개 실패만 남고 이 테스트도 통과). 코드가 아니라 동시 실행 환경 문제로 판단 — 필요하면 나중에 CI에서 격리 실행으로 확인.

