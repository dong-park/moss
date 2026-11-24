# n1-material-model — 벽 재질·메모판 재질 데이터와 레지스트리

> 자기완결 브리프. `spec/glass-wall/glass-surface/` 밑에 산다. runner는 상위 spec + 이 파일만 본다. 진행·상태는 이 파일에만 쓴다 — 상위 spec은 호출자가 고친다.

**agent**: runner
**id**: GS-1
**상위**: spec/glass-wall/glass-surface/spec.md
**deps**: 없음
**상태**: 아직 안 함
**담당 행**: T4, T6, T7, T14

## 문제

벽 재질과 메모판 재질을 담을 자리가 없어서, 화면도 고르는 자리도 만들 수 없다.

## 목표

보드마다 벽 재질 하나, 메모판마다 메모판 재질 하나를 저장하고 읽는다. 모르는 값은 벽은 유리, 메모판은 코르크로 읽는다. 벽 재질은 보드 문서로 동기화된다.

## 확정된 결정

- D2 = A. 벽 재질은 보드 문서에 저장한다. 공유 보드면 모두 같은 재질을 보고, 내 다른 기기에서도 같다.
- D6 = C. 메모판 재질은 벽과 따로 고른다. 값은 벽과 같은 세 개다. 기본은 코르크다 — 시안 01에서 추정, spec의 `확인 안 된 것` 참고.
- 합법 값은 `glass` `whiteboard` `cork` 셋뿐이다.

## 작업

1. 새 파일 `web/src/state/wallMaterials.ts`에 레지스트리를 만든다. `frameSkins.ts`의 `FRAME_SKINS`·`frameSkinFor` 모양을 따른다. 재질마다 id, 한국어 라벨 키, 보조 문구 키, 대비 판정에 쓸 대표 바탕색 목록을 둔다. `wallMaterialFor(raw)`는 모르는 값을 `glass`로, `frameMaterialFor(raw)`는 모르는 값을 `cork`로 읽는다.
2. `web/src/state/db/schema.ts`의 `Board`에 비인덱스 optional `wallMaterial`을 더한다. Dexie 버전은 올리지 않는다 — `Connection.sourceSide` 선례.
3. `web/src/state/ydoc/model.ts`의 보드 필드 목록(`BOARD_KEYS`)에 `wallMaterial`을 넣어 보드 문서로 동기화되게 한다.
4. `web/src/state/frameContent.ts`의 판 내용에 `material` 필드를 더한다. 깨지거나 없는 값은 코르크로 읽는다. 기존 `skin`·칸 목록 읽기는 바꾸지 않는다.
5. `web/src/state/workspace.ts`에 `setWallMaterial(boardId, id)`와 `setFrameMaterial(frameId, id)`를 더한다. 같은 값으로 바꾸면 아무것도 쓰지 않는다. 카드·획 좌표는 건드리지 않는다.
6. 테스트: 새 파일 `web/src/state/__tests__/wallMaterials.test.ts`.
   - 값 없음·모르는 이름·숫자·null → 벽 `glass`, 메모판 `cork` (T7).
   - `setWallMaterial` 전후 모든 note의 x·y·w·h·rotation이 같다 (T4).
   - Yjs 문서 왕복 뒤 `wallMaterial`이 남는다 (T6 저장 쪽).
   - 벽 재질을 바꿔도 메모판 `material`·`skin`이 그대로고, 그 반대도 같다 (T14).

## 완료 기준

- [ ] spec 공통 완료 기준 전부
- [ ] `cd web && bun run test -- src/state/__tests__/wallMaterials.test.ts src/state/__tests__/frameContent.test.ts src/state/__tests__/frameSkins.test.ts` 통과
- [ ] `cd web && bunx tsc --noEmit` 통과
- [ ] 실경로: 테스트가 `workspace.ts`의 실제 setter와 실제 Yjs 문서를 탄다. 직접 주입으로만 green이면 갭을 구현 메모에 남긴다

## 파일 포인터

| 경로 | 역할 |
|---|---|
| `web/src/state/frameSkins.ts` | 레지스트리 모양 선례 |
| `web/src/state/frameContent.ts` | 메모판 내용 JSON, `material` 필드 추가 |
| `web/src/state/db/schema.ts` | `Board` 117행, optional 필드 추가 |
| `web/src/state/ydoc/model.ts` | `BOARD_KEYS`, `toSharedBoard` |
| `web/src/state/workspace.ts` | setter 추가 |
| `web/src/state/wallMaterials.ts` | 새 파일 |
| `web/src/state/__tests__/wallMaterials.test.ts` | 새 파일 |

## 담당 행 메모

- T7, T14(데이터 쪽), T4·T6(저장 쪽)
