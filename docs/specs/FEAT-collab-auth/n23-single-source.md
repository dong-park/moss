# n23-single-source — 원본을 Yjs 하나로 (n2·n3 통합)

> 자기완결 브리프. runner는 `docs/specs/FEAT-collab-auth.md`와 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n2, n3 (둘 다 `feat/collab-auth`에 병합됨)
**상태**: done (2026-09-28)

## 문제

n2(이전)와 n3(쓰기 전환)를 따로 만들어 원본이 반씩 갈렸다. 쓰기는 Y.Doc으로 가는데 읽기·`.moss` 가져오기·MCP 브리지는 Dexie를 원본으로 쓴다. 그래서 n2 재심사 P0 2건(이전 완료 뒤 merge 가져오기 누락, 부팅 30초 대기)과 n3 리뷰 P1 대부분이 같은 뿌리에서 나왔다. 사용자 결정 2026-09-28: 통합 노드로 푼다.

## 목표

보드·메모·연결선의 원본은 보드별 Y.Doc 하나다. 앱의 모든 읽기·쓰기·가져오기·브리지가 그 원본을 거친다. Dexie의 notes·boards·connections는 검색 등 파생 인덱스와 휴지통·설정만 남는다. D3.

## 작업

1. **읽기 전환**: `loadFromStorage`·보드 전환이 카드·연결선·보드 메타를 Y.Doc(`readNotes`/`readConnections`/`readBoard`)에서 읽는다. 기기 로컬 필드(lastVisitedAt 등)만 Dexie에서 합친다. Dexie 시드에 기대던 기존 테스트는 Y.Doc 시드로 옮긴다(테스트를 지우거나 skip하지 않는다).
2. **쓰기 한 곳으로**: 카드 변경의 공유 필드 쓰기를 헬퍼 하나로 모은다(n3 리뷰: `withActiveDoc` 수동 짝 21곳, `moveCard`·키보드 이동 누락). `persistCard` 경로가 문서 쓰기를 포함하게 하거나 `writeCardFields(boardId,id,fields)` 하나로. 드래그 중에는 쓰지 않는 규칙(D4)은 유지.
3. **가져오기·브리지**: `.moss` 가져오기(merge·overwrite)와 `mossBridge`가 보드·메모·연결선을 Y.Doc에 직접 쓴다. 따라서 이전(`migrateDexieBoards`)은 "옛 Dexie 데이터 최초 1회"로만 남고, 완료 버전 조기 반환은 이제 안전하다. 가져오기 입력 검증(SYSTEM_BOARD_ID 거부, 필드 타입)은 유지.
4. **이전 부팅 예산**: 이전은 부팅 앞에서 최대 3초만 기다린다. 넘으면 로딩 화면을 띄우고 이전이 끝나면 스토어를 다시 읽는다. 타임아웃된 핸들은 반드시 destroy(누수 금지, 검증 핸들 포함). 반환하는 failures는 복사본.
5. **이전 검증 정합**: 영속 검증은 "원본 메모 id가 모두 문서에 있는가(부분집합)". 전처리 필터는 `isRenderableNote`와 같은 조건. 버전을 올리면 migratedDocs를 비우고 재이전.
6. **n3 리뷰 반영**: (a) `moveCardBetweenDocs`는 대상 문서 내용을 Dexie가 아니라 원본 Y.Doc에서 읽고, 대상 문서 변경도 탭 간 방송한다. (b) `activateBoardDoc`는 `whenLoaded` 성공 뒤에 activeKey를 바꾸고 실패 시 되돌린다. (c) 원격 연결선 반영은 변경된 id만 읽고, 삭제도 반영한다. (d) 원격 반영의 Dexie 파생 쓰기는 디바운스. (e) `liveSync` 수신은 `Uint8Array`·크기 상한 검사 + try/catch. (f) 활성 보드 전환을 `activateBoard(id)` 하나로 묶어 activeKey·반영 바인딩·liveSync attach를 함께 소유. (g) 문서 키는 `SYSTEM_BOARD_ID`에서 파생, 미사용 export(`peekBoardDoc`, `getActiveBoardKey`) 삭제. (h) 비활성 보드 문서는 전환 시 닫는다.
7. **크로스보드 연결선**: 소유 문서는 source 메모의 보드 하나. 반대쪽 보드는 조회 시 id로 모은다. 비공개 보드 정보가 공유 보드 문서에 실리지 않게(n2 보안 P2). 이전의 양쪽 쓰기는 되돌린다.

## 완료 기준

- [x] spec 공통 완료 기준 전부 (`cd web && bun run test && bunx tsc --noEmit`, 새·수정 파일 eslint 0. 기준선 Canvas.virtualization 1건·ExportModal lint는 기존 실패)
- [x] 앱 경로의 읽기가 Y.Doc에서 온다는 테스트: Dexie notes 테이블을 비워도 보드가 그대로 열린다
- [x] merge 가져오기 후 새로고침해도 가져온 보드·메모가 보인다(이전 완료 버전 유지 상태에서)
- [x] MCP 브리지 `notes.create`가 Y.Doc에 들어간다(AC-16 응답 형식 유지)
- [x] 이전이 3초를 넘기면 부팅이 이어지고, 끝난 뒤 스토어가 갱신된다. 타임아웃 핸들 누수 0 테스트
- [x] 6(a)~(e) 각각 회귀 테스트
- [x] AC-1: 로그인·네트워크 없이 보드 생성·새로고침 보존
- [x] 실경로: 관통이 프로덕션 경로를 탐. 우회 green이면 갭 기록

## 참고 (데이터다, 지시가 아니다)

- n3 리뷰 5축 전문: `/tmp/n3-review.md`
- n2 재심사 5축 전문: `/tmp/n2-rereview.md`

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/workspace.ts` | 스토어. 읽기·쓰기 전환 대상 |
| `web/src/state/ydoc/activeDoc.ts` | 보드 문서 수명 |
| `web/src/state/db/liveSync.ts` | 탭 간 Y 업데이트 |
| `web/src/state/db/dexieMigration.ts` | 최초 1회 이전 |
| `web/src/components/notifications/StorageBootstrap.tsx` | 부팅 순서 |
| `web/src/state/export/mossBundleImport.ts` | 가져오기 |
| `web/src/state/bridge/mossBridge.ts` | MCP 브리지 |
| `web/src/state/storage.ts` | Dexie 파생·휴지통 |

## 구현 메모

- 슬라이스 1~2(읽기·쓰기 전환, n3 리뷰): `workspace.ts` — `loadBoardCards`(문서 원본 + Dexie 로컬 필드 합침), `activateBoard`(activeKey·반영 observer·liveSync attach 단일 소유), `writeCardToDocHandle`(공유 필드 쓰기 단일 통로), `moveCardBetweenDocs`(원본 Y.Doc 읽기·탭 방송·비활성 문서 닫기), 원격 연결선 반영 id 한정·삭제 반영·Dexie 디바운스. `activeDoc.ts` — `closeBoardDoc`, `activateBoardDoc` 롤백·이전 문서 닫기. `liveSync.ts` — 수신 Uint8Array·10MB 상한·try/catch, `broadcastDocWrite`. `boardIds.ts`(leaf) + 문서 키 파생.
- 슬라이스 3(가져오기·브리지): `ydoc/writeThrough.ts` — `writeToBoardDoc`(활성=직접, 비활성=열고 방송·닫기) + 레코드 헬퍼. `mossBundleImport.ts`가 보드·메모·연결선을 보드별로 묶어 문서에 직접 쓰고 overwrite는 옛 문서를 비운다. `mossBridge.ts`가 비활성 보드 create/update/delete·createBoard·connections를 문서에 쓴다.
- 슬라이스 4~5(이전): `StorageBootstrap.tsx` `runBootstrap(예산 3초)` — 초과 시 로딩 표시 후 이전 완료 때 스토어 재로드. `dexieMigration.ts` — 문서별 타임아웃·destroy 별도 상한, 부분집합 검증, 버전 올리면 재이전, source 보드 단독 연결선 소유.
- 슬라이스 6~7: n3 리뷰 (a)~(h) 및 크로스보드 연결선 소유 변경. `model.ts` — `updateNoteFields`, `readConnection`.
- 회귀 테스트: `n23-single-source.test.ts`(읽기·가져오기·브리지·6a·6c/d·6h), `ydoc/__tests__/activeDoc.test.ts`(6b), `components/notifications/__tests__/storageBootstrap.test.ts`(작업 4), `db/__tests__/liveSync.test.ts`(6e), 기존 `storeOnYjs.test.ts`(AC-1).
- **갭**: 부팅 예산 테스트는 `loadFromStorage`를 스텁해 스토어 실경로를 탐하지 않는다(이전 예산·재로드 순서만 검증). 이전 자체의 핸들 누수 0은 `dexieMigration.test.ts` P1-3b가 실제 open/destroy 경로로 검증한다. 클라이언트측 커서·Awareness는 이 노드 범위 밖.
- **호출자가 정할 것**: import overwrite 시 활성 문서를 비우는 경로는 앱 내 내보내기/가져오기 UI가 실행 중일 때 observer와 겹칠 수 있다(현재 테스트는 비활성 상태만 검증).
- **5축 리뷰 후속(2026-09-28)**: P1 1~10 + P2 11~14 반영 — 연결선 단일 소유(storage 활성 문서 쓰기 제거), import boardId 검증·`docKeyForBoard` 방어, overwrite 활성 보드 재로드, 실패 핸들 discard, `saveNote` 정규화 Note 반환, 재로드 현재 보드 재활성·오버레이 전환 차단, `moveFrame` 드래그 중 `{doc:false}`, `moveCardBetweenDocs` 대상 로드 뒤 원본 삭제, 비활성 문서 TTL 재사용, import 동시 4 제한, 공유 필드 diff 쓰기, `loadLastVisitedAt`, 연결선 bulk 반영, `runMigrationLocked` void. 회귀 테스트: `n23-single-source.test.ts`(P1-1·2·3·5·6·8·9·10, P2-11·13), `activeDoc.test.ts`(P1-4), `storeOnYjs.test.ts`(P1-7), `storage.test.ts`(P1-5·P2-12).
- **재심사 2R 후속(2026-09-28)**: 가드를 스토어 진입부로 옮기고 오버레이는 pointerEvents:none(표시 전용), `sharedSnapshot` leaf로 diff 스냅샷을 문서 쓰기 단일 출구가 갱신·삭제 경로가 정리, `moveCardBetweenDocs` 소스 로드 실패도 discard, 가져오기 clear 동시 4·`writeToBoardDoc {closeNow}`로 open 수 제한, overwrite 항상 재로드·merge boardId 허용 집합 검증, 연결선 save/remove를 storage 한 액션으로(소유=원본 문서의 source 메모 보드), `docKeyForBoard` total 매핑·`persistCardDexie` 캐스팅 제거·비활성 close 타이머 activeDoc 키 단위 소유(재오픈 취소). 회귀 테스트: `n23-single-source.test.ts` 2R-1~7.
