# FEAT-collab-auth — 실행 계획 (DAG)

> `/spec` dag kind=issues. 원천 spec은 `docs/specs/FEAT-collab-auth.md`, 노드 브리프는 `docs/specs/FEAT-collab-auth/`. 실행: `/go docs/specs/FEAT-collab-auth.md` + 노드 브리프 경로. deps 없는 노드는 병렬.

## 공통 완료 기준

1. 웹: `cd web && bun run test && bunx tsc --noEmit && bun run lint` 통과
2. 서버: `cd server && ./gradlew test`, 동기화: `cd sync && bun test` 통과. 해당 노드만
3. 새 로직마다 테스트 최소 1개, Conventional Commits `feat(moss): …`
4. 실경로 검증: stub·직접 주입으로만 green이면 결산에 갭으로 기록
5. 혼자 쓰는 보드 경로는 로그인·네트워크 없이 그대로 동작한다. AC-1

## DAG

```
n1 yjs-doc-model ──┬─► n2 dexie-migration
                   └─► n3 store-on-yjs ─────────┐
n4 server-ktor ──┬─► n5 sync-hocuspocus ────────┤
                 ├─► n6 client-auth ────────────┼─► n7 client-sync ─┬─► n8 share-ui ─► n9 membership-lifecycle
                 │          └───────────────────┼───────────────────┘
                 └──────────────────────────────┴─► n10 attachments ◄─ n7
                                                     n11 prd-bridge-finish ◄─ n7
```

진입점 2개: n1, n4. 첫 물결은 n1·n4 병렬, 둘째 물결은 n2·n3·n5·n6 병렬. critical path n4→n6→n7→n8→n9, 길이 5 < 노드 11.

## edge 사유

- n1→n2: n2가 n1의 Dexie↔Y.Map 변환 함수를 쓴다
- n1→n3: n3가 n1의 openBoardDoc과 문서 구조를 쓴다
- n4→n5: n5가 n4가 서명한 보드 토큰 형식과 키를 검증한다
- n4→n6: n6가 n4의 /auth API를 부른다
- n3→n7: n7이 n3의 Y.Doc 기반 스토어에 provider를 붙인다
- n5→n7: n7이 n5 서버에 연결한다
- n6→n7: n7이 n6의 토큰으로 보드 토큰을 받는다
- n6→n8: n8의 팝오버가 n6의 로그인 흐름을 띄운다
- n7→n8: n8이 n7의 연결·Awareness로 아바타를 그린다
- n8→n9: n9가 n8의 해제·내보내기 액션이 보낸 신호를 처리한다
- n4→n10: n10이 n4 서버에 파일 API를 더한다
- n7→n10: n10이 n7의 공유 보드 연결 위에서 fileId를 동기화한다
- n7→n11: n11의 AC-16이 n7의 공유 보드 동기화를 필요로 한다

## 커버리지

| 요구 | 노드 |
|---|---|
| AC-1 | n3, n6 |
| AC-2·3 | n2 |
| AC-4·6·15 | n8 |
| AC-5·12 | n6 |
| AC-7·8·9·10·11 | n7 |
| AC-13·14·17 | n9 |
| AC-16 | n11 |
| D12 첨부 | n10 |
| PRD 수정 | n11 |
| docker-compose | n4, n5 |

## 노드 인덱스

| ID | 브리프 | deps | 상태 |
|---|---|---|---|
| n1 | [n1-yjs-doc-model](FEAT-collab-auth/n1-yjs-doc-model.md) | — | done (리뷰 통과) |
| n2 | [n2-dexie-migration](FEAT-collab-auth/n2-dexie-migration.md) | n1 | done — n23으로 흡수 |
| n3 | [n3-store-on-yjs](FEAT-collab-auth/n3-store-on-yjs.md) | n1 | done — n23으로 흡수 |
| n23 | [n23-single-source](FEAT-collab-auth/n23-single-source.md) | n2, n3 | done (리뷰 2라운드, e820fe4) |
| n4 | [n4-server-ktor](FEAT-collab-auth/n4-server-ktor.md) | — | done (리뷰 통과, 95f6ba8) |
| n5 | [n5-sync-hocuspocus](FEAT-collab-auth/n5-sync-hocuspocus.md) | n4 | done (리뷰 2라운드, 병합) |
| n6 | [n6-client-auth](FEAT-collab-auth/n6-client-auth.md) | n4 | done (리뷰 2라운드, 병합) |
| n7 | [n7-client-sync](FEAT-collab-auth/n7-client-sync.md) | n3, n5, n6 | done (병합) |
| n8 | [n8-share-ui](FEAT-collab-auth/n8-share-ui.md) | n6, n7 | done (병합) |
| n9 | [n9-membership-lifecycle](FEAT-collab-auth/n9-membership-lifecycle.md) | n8 | done (병합) |
| n10 | [n10-attachments](FEAT-collab-auth/n10-attachments.md) | n4, n7 | done (병합) |
| n11 | [n11-prd-bridge-finish](FEAT-collab-auth/n11-prd-bridge-finish.md) | n7 | done (병합) |

## 파킹 / 보류 로그

- 2026-09-28: n2·n3를 따로 만들어 원본이 Yjs·Dexie로 갈렸다. 통합 노드 n23 추가. n7은 n23 뒤로.


| 날짜 | 노드 | 사유 |
|---|---|---|
| | | |
