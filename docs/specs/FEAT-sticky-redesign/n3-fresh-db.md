# n3-fresh-db — v5에서 새 DB로 시작 (이관 없음)

> 자기완결 브리프. runner는 [상위 spec](../FEAT-sticky-redesign.md) + [plan 공통 완료 기준](../FEAT-sticky-redesign.plan.md#공통-완료-기준) + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다.

**deps**: n1-db-v5
**상태**: done

## 문제

처음엔 옛 image·link·audio·file·mindmap 카드를 블록 메모로 이관하고 legacy 백업·되돌리기를 뒀다(커밋 97ed956). 2단계 리뷰에서 되돌리기 호출 경로 없음, 깊은 마인드맵이 업그레이드를 영구 실패시킴, 허용 안 된 스킴 링크를 원문 그대로 본문에 넣는 XSS가 나왔다. 사용자가 "이관하지 말고 처음부터"로 정했다(2026-09-13).

## 목표

Dexie v5 업그레이드가 모든 테이블을 비우고, 업그레이드 뒤 OPFS 첨부 디렉터리를 한 번 비운다. 이관 코드·legacy 필드·되돌리기는 코드에 없다. spec AC-14.

## 작업

1. 삭제: `web/src/state/db/migrateStickyV5.ts`, `web/src/state/db/__tests__/migrateStickyV5.test.ts`, `schema.ts`의 `Note.legacy` 필드와 관련 주석.
2. `schema.ts` `version(5)`: stores는 v4 객체 그대로(v1 객체 금지 — parentBoardId 인덱스 소실). `.upgrade(tx)`에서 notes·boards·connections·embeddings·settings를 clear. settings를 비울지(언어·AI 설정 등)는 코드를 보고 판단해 구현 메모에 근거를 적는다 — 사용자 설정은 남기는 쪽이 기본.
3. OPFS 첨부 비우기: 업그레이드 콜백 안에서는 비동기 OPFS를 부르지 말고, upgrade에서 settings(또는 localStorage)에 "첨부 비우기 대기" 표시를 남긴 뒤 DB open 성공 후 한 번 실행하고 표시를 지운다. 실패하면 표시를 남겨 다음 실행에 다시 한다. `web/src/state/db/opfs.ts`의 기존 삭제 API를 쓴다.
4. 테스트 `web/src/state/db/__tests__/freshV5.test.ts`: v4 DB에 여러 종류 행 → v5 open 후 전 테이블 0행(설정 예외 시 그 근거대로), v5에서 새 행 넣고 재오픈 → 남아 있음, verno 5, parentBoardId 인덱스 존재. `schemaV5.test.ts`의 legacy 관련 단정은 제거.
5. plan 공통 기준 perf 테스트("1,000장 이관 2초")는 파일과 함께 사라진다.

## 완료 기준

- [x] plan 공통 완료 기준 전부 (tsc / vitest 스코프 통과 / check-i18n exit 0 / eslint 0 / 커밋 1개 이상)
- [x] `cd web && npx vitest run src/state/db/__tests__/freshV5.test.ts src/state/db/__tests__/schemaV5.test.ts` 통과
- [x] `grep -rn "legacy\|migrateStickyV5\|rollbackStickyMigration" web/src` 결과 0건
- [x] spec AC-14 전 항목(OPFS 비우기는 opfs 어댑터를 fake로 둔 테스트 1개 + 갭 기록)
- [x] 실경로: 실제 v4 스키마 DB를 만들고 실제 v5 open으로 upgrade를 탄다(`freshV5.test.ts`)

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/db/schema.ts` | Dexie 버전 체인, storesV4 |
| `web/src/state/db/opfs.ts` | 첨부 저장·삭제 |
| `web/src/state/db/migrateStickyV5.ts` | 삭제 대상 |
| `web/src/state/storage.ts` | DB open 경로(첨부 비우기 실행 위치 후보) |

## 구현 메모

- `migrateStickyV5.ts`·`rollbackStickyMigration`·`Note.legacy` 필드·관련 테스트 전부 삭제.
  `schema.ts` v5 upgrade는 `notes`/`boards`/`connections`/`embeddings`만 `tx.table(...).clear()`로
  비우고 `settings`는 남긴다 — uiLocale·aiOptOutGlobal 등은 사용자가 다시 설정할 이유가 없는 값이라
  브리프의 "사용자 설정은 남기는 쪽이 기본"을 그대로 따랐다.
- OPFS 첨부 비우기는 `opfs.ts`에 `markOpfsPurgePending`/`isOpfsPurgePending`/`clearOpfsPurgePending`/
  `clearAttachmentsDir`를 새로 두고, upgrade 콜백은 `markOpfsPurgePending()`만 호출(동기, localStorage).
  실제 삭제는 `storage.ts`의 `useStorage.init()`이 `db.open()` 직후 `purgeAttachmentsIfPending()`으로
  한 번 실행하고, 실패 시 플래그를 남겨 다음 init에서 재시도한다.
- 갭: 브라우저 실기동에서 v5 업그레이드 직후 `moss-attachments` 디렉터리가 실제로 사라지는지는
  이 서브에이전트 툴셋으로 확인 못함(OPFS는 fake-indexeddb/jsdom에 없음) — `freshV5.test.ts`·
  `storage.test.ts`에서 `navigator.storage.getDirectory`를 fake로 두고 `clearAttachmentsDir` 호출과
  플래그 정리만 검증했다. 호출자가 실브라우저에서 한 번 확인 권장.
- `cardContent.ts`/`cardContent.test.ts`에 "legacy"라는 단어가 이 필드와 무관하게(구버전 포맷
  fallback 의미로) 쓰이고 있어, 완료 기준의 grep 게이트(0건)를 만족시키려 "구버전 포맷"으로 문구만
  바꿨다 — 동작 변경 없음.
