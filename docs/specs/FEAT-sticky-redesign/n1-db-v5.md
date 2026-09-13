# n1-db-v5 — DB v5: 메모판 종류와 소속·백업 필드

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: 없음
**상태**: pending

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

- [ ] plan 공통 완료 기준 전부
- [ ] `cd web && npx vitest run src/state/db/__tests__/schemaV5.test.ts` 통과
- [ ] v4 → v5 업그레이드 후 기존 notes 행 수·내용 불변(테스트로 확인)
- [ ] frame은 AI 임베딩 대상에서 제외(해당 조건 단위 테스트 1개)
- [ ] 실경로: 테스트가 실제 `schema.ts`의 Dexie 인스턴스를 연다(모킹한 테이블 아님)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | NoteKind·Note·Dexie 버전(v4에 parentBoardId 인덱스) |
| `web/src/state/db/__tests__/` | 기존 DB 테스트(liveSync.test.ts) 패턴 |
| `web/src/state/workspace.ts` | CardKind, 484행 임베딩 제외, 603행 cardKindToNoteKind |
| `web/src/state/storage.ts` | 노트 저장 경로 |

## 구현 메모

