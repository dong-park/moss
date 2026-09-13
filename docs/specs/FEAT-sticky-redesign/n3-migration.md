# n3-migration — 옛 카드 이관과 되돌리기

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n1-db-v5 (legacy 필드·v5 훅), n2-blocks (serializeBlock)
**상태**: pending

## 문제

메모를 한 종류로 합치면 이미 저장된 image·link·audio·file·mindmap 카드가 갈 곳이 없다. 사용자 데이터를 바꾸는 되돌리기 어려운 단계라 백업과 되돌리기가 필요하다.

## 목표

v5 업그레이드가 다섯 종류를 text 메모로 한 번만 옮기고, 원본을 `legacy`에 남긴다. `rollbackStickyMigration()`이 편집 안 한 행을 원래대로 되돌리고 건너뛴 개수를 돌려준다.

## 작업

1. `web/src/state/db/migrateStickyV5.ts` 신규, n1이 만든 v5 `.upgrade()` 훅에 연결.
   - image/audio/file → 해당 블록 하나 든 본문(`serializeBlock`). link → 링크 블록(OG thumbUrl·summary는 본문에 안 넣고 legacy.content에만).
   - mindmap → `web/src/state/cardContent.ts`의 `parseMindmap` → 루트부터 DFS, depth d 노드는 `"  ".repeat(d) + "- " + text`. 빈 text 노드도 빈 항목으로 남겨 자식 깊이 보존. 망가진 JSON → 빈 목록 + 백업.
   - 모두 `kind="text"`, width는 메모 기본 폭, height 비움. `legacy = {kind, content, attachmentRef, mediaType, width, height, migratedAt, migratedContent}`.
   - 첨부 OPFS 파일은 절대 지우지 않는다.
2. `rollbackStickyMigration()` export: `legacy` 있고 `content === legacy.migratedContent`인 행만 복원 후 `legacy` 비움. 반환 `{restored, skipped}`.
3. 이관은 Dexie upgrade 트랜잭션 안에서만. 중간 중단 시 Dexie가 롤백하고 다음 실행에 다시 돈다(spec §4 동시성).
4. 테스트 `web/src/state/db/__tests__/migrateStickyV5.test.ts`: v4 DB에 다섯 종류 1개씩 + 망가진 mindmap + 이미 text인 행 → 업그레이드 결과·백업, 형제 순서 보존, 되돌리기(편집한 행 건너뜀), 1,000장 이관 2초 이내.

## 완료 기준

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/state/db/__tests__/migrateStickyV5.test.ts` 통과
- [ ] spec AC-14: 다섯 행 모두 text, 블록 본문, 들여쓰기 목록 순서 일치, legacy에 원래 종류·본문, 첨부 삭제 0
- [ ] spec AC-15: 되돌리기 후 원래 종류·본문, legacy 비움, 편집 행 skipped 카운트
- [ ] spec §5 불가능한 조합(원래 종류인데 백업 있음 등) 0건을 테스트가 확인
- [ ] 카드 1,000장 이관 < 2s (테스트 내 측정)
- [ ] 실경로: 실제 v4 스키마로 DB를 만들고 실제 v5 오픈으로 upgrade를 탄다(함수 직접 호출만으로 green 금지)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | v5 선언·upgrade 훅(n1) |
| `web/src/state/cardContent.ts` | `parseMindmap` 등 카드 content 파서 |
| `web/src/state/__tests__/cardContent.test.ts` | mindmap 파싱 테스트 패턴 |
| `web/src/components/workspace/cards/mindmap/Content.tsx` | `FlatNode {node, depth}` 평탄화 참고 |
| `web/src/state/db/opfs.ts` | 첨부 저장소(지우지 말 것) |
| `web/src/state/blocks.ts` | serializeBlock(n2) |

## 구현 메모

