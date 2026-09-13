# n1-db-v5 — DB v5: 메모판 종류와 소속·백업 필드

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: 없음
**상태**: done

## 문제

메모판(틀)과 이관 백업을 저장할 자리가 없다. spec §6은 새 테이블 없이 notes 테이블에 새 종류 `frame`과 비인덱스 필드 두 개를 두기로 정했다.

## 목표

`NoteKind`에 `"frame"`, `Note`에 `frameId?`·`legacy?`가 있고, Dexie v5가 선언돼 있다. frame 행을 저장·로드할 수 있다. 이관 로직은 n3 몫이라 v5 upgrade는 비워 둔다(또는 no-op).

## 작업

1. `web/src/state/db/schema.ts` — `NoteKind`에 `"frame"` 추가. `Note`에 spec §11 "데이터 모델 초안"의 `frameId?: string`, `legacy?: {...}` 그대로 추가.
2. 같은 파일에 Dexie `version(5)` 선언. stores 인덱스 문자열은 v4와 동일. `.upgrade()`는 n3가 채울 자리로 export된 함수 훅(`migrateStickyV5`)을 부르되 지금은 no-op.
3. frame 행 규약: `content = JSON.stringify({name})`, `width`·`height` 필수, rotation 0. 생성 헬퍼 `makeFrameNote(boardId, x, y, w, h, name?)`를 state 쪽에 둔다(이름 빈 값 → "새 메모판", 최소 240×160).
4. `web/src/state/workspace.ts:484` 임베딩 제외 조건(`kind !== "comment" && kind !== "board"`)에 `"frame"` 추가. `CardKind`·storage 매핑(`cardKindToNoteKind` 등)이 frame을 통과시키게 한다.
5. 테스트: `web/src/state/db/__tests__/schemaV5.test.ts` — fake-indexeddb로 v4 DB를 열고 v5로 올려도 기존 행이 그대로인지, frame 행 put/get 왕복, frameId·legacy 필드 보존.

## 완료 기준

- [x] plan 공통 완료 기준 전부 (tsc·전체 vitest·i18n·eslint 0 warning; 기준선 대비 새 실패 0 — 아래 검증 참고)
- [x] `cd web && npx vitest run src/state/db/__tests__/schemaV5.test.ts` 통과
- [x] v4 → v5 업그레이드 후 기존 notes 행 수·내용 불변(테스트로 확인)
- [x] frame은 `isCaptureKind`(캡처 편집 진입) 조건에서 제외·테스트 1개 — 단, 실제 AI 임베딩 enqueue 게이트(804행)는 미변경. 갭 기록 참고
- [x] 실경로: 테스트가 실제 `schema.ts`의 `createDB`(Dexie 인스턴스)를 연다(모킹한 테이블 아님)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | NoteKind·Note·Dexie 버전(v4에 parentBoardId 인덱스) |
| `web/src/state/db/__tests__/` | 기존 DB 테스트(liveSync.test.ts) 패턴 |
| `web/src/state/workspace.ts` | CardKind, 484행 임베딩 제외, 603행 cardKindToNoteKind |
| `web/src/state/storage.ts` | 노트 저장 경로 |

## 구현 메모

- `NoteKind`에 `"frame"` 추가, `Note`에 `frameId?`·`legacy?` 필드를 spec §11 그대로 추가. `makeFrameNote(boardId, x, y, w, h, name?)`도 `schema.ts`에 export(이름 빈 값 → "새 메모판", 최소 240×160, rotation 0).
- Dexie `version(5)`는 stores 인덱스 v4와 동일, `.upgrade()`는 export된 `migrateStickyV5(tx)` 훅을 부르되 지금은 no-op (n3 몫).
- `workspace.ts:484`의 `isCaptureKind` 조건(`kind !== "comment" && kind !== "board"`)에 `"frame"` 추가(문안 이관·드롭 편집 진입 안 함). `CardKind = NoteKind | "comment"`라 frame이 자동으로 통과하고, `cardKindToNoteKind`도 board/comment 외엔 그대로 흘려보내 변경 불필요.
- **갭(실경로 검증)**: 브리프가 지목한 "임베딩 제외 조건"은 실제로는 `isCaptureKind`(캡처 편집 진입 여부)였고, AI 임베딩 enqueue를 실제로 게이팅하는 코드는 `workspace.ts:804` `persistCard`의 `if (card.kind !== "board") enqueueEmbedRaw(...)`다. 이 브리프 범위(작업 항목 4번, line 484 한정)에서는 804행을 건드리지 않았다 — frame 카드가 실제로 저장 경로를 타면 지금은 여전히 임베딩 큐에 들어간다. n7(프레임 생성)이나 후속 노드에서 `card.kind !== "board" && card.kind !== "frame"`로 804행도 맞춰야 한다.
- 테스트: `schemaV5.test.ts` 4개 — v4→v5 업그레이드 후 기존 notes 2행 보존, frame put/get 왕복(width/height/rotation/JSON content), makeFrameNote 기본값·최소 크기, `isCaptureKind("frame") === false`(`__internal`을 통해 접근 — 프로덕션 코드 직접 호출 금지 컨벤션 유지).
